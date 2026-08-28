import 'server-only';

import {
  MockFormaInferenceProvider,
  type FormaDocumentArtifacts,
  type FormaInferenceProvider,
  type FormaInferenceServiceStatus,
  type FormaInferenceStatus,
  type FormaMediaObservation,
  type FormaReasoningResult,
} from './forma-inference';

type ChatContent = string | Array<
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
>;

type ChatMessage = { role: 'system' | 'user'; content: ChatContent };

type HuggingFaceChatResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string } | string;
};

type HuggingFaceResponseContent = string | Array<{ type?: string; text?: string }> | undefined;

export type HuggingFaceInferenceConfig = {
  baseUrl: string;
  token?: string;
  reasoningModel: string;
  visionModel: string;
  allowMockFallback: boolean;
};

function contentText(content: HuggingFaceResponseContent) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((item) => item?.text || '').join('\n').trim();
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  const stripped = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function safeConfidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

function emptyDocument(input: Parameters<FormaInferenceProvider['parseDocument']>[0]): FormaDocumentArtifacts {
  return {
    sourceId: input.sourceId,
    title: input.name,
    artifactType: 'engineering-document',
    component: null,
    sections: [],
    partNumbers: [],
    requirements: [],
    properties: [],
  };
}

export class HuggingFaceInferenceProvider implements FormaInferenceProvider {
  readonly name = 'huggingface' as const;
  private readonly fallback = new MockFormaInferenceProvider();
  private lastStatus: FormaInferenceStatus;

  constructor(private readonly config: HuggingFaceInferenceConfig) {
    this.lastStatus = this.initialStatus();
  }

  private fallbackMode() {
    return this.config.allowMockFallback ? 'mock' as const : 'unavailable' as const;
  }

  private initialStatus(): FormaInferenceStatus {
    const mode = this.fallbackMode();
    const configured = Boolean(this.config.token);
    return {
      mode,
      provider: this.name,
      connected: false,
      endpoint: this.config.baseUrl,
      disclosure: configured
        ? 'Hugging Face Inference Providers are configured but have not been probed. Model output remains advisory.'
        : 'HF_TOKEN is missing. The explicit deterministic demo remains available.',
      services: [
        { capability: 'reasoning', mode, model: this.config.reasoningModel, endpointConfigured: configured, connected: false },
        { capability: 'vision', mode, model: this.config.visionModel, endpointConfigured: configured, connected: false },
        { capability: 'document-parse', mode, model: this.config.reasoningModel, endpointConfigured: configured, connected: false, detail: 'Text and image documents only; PDF page rendering remains a separate adapter.' },
      ],
    };
  }

  getStatus() {
    return this.lastStatus;
  }

  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || 'Hugging Face request failed.');
    return (this.config.token ? message.replaceAll(this.config.token, '[redacted]') : message).slice(0, 500);
  }

  private async chat(model: string, messages: ChatMessage[], maxTokens = 700) {
    if (!this.config.token) throw new Error('HF_TOKEN is not configured.');
    const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1, stream: false }),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    const raw = await response.text();
    let payload: HuggingFaceChatResponse;
    try {
      payload = JSON.parse(raw) as HuggingFaceChatResponse;
    } catch {
      throw new Error(`Hugging Face returned non-JSON HTTP ${response.status}.`);
    }
    if (!response.ok) {
      const detail = typeof payload.error === 'string' ? payload.error : payload.error?.message;
      throw new Error(detail || `Hugging Face returned HTTP ${response.status}.`);
    }
    const text = contentText(payload.choices?.[0]?.message?.content);
    if (!text) throw new Error('Hugging Face returned an empty completion.');
    return { text, payload };
  }

  private markConnected(capability: FormaInferenceServiceStatus['capability'], model: string, detail: string) {
    this.lastStatus = {
      ...this.lastStatus,
      mode: 'huggingface',
      connected: true,
      checkedAt: new Date().toISOString(),
      services: this.lastStatus.services.map((service) => service.capability === capability
        ? { ...service, mode: 'huggingface', model, connected: true, endpointConfigured: true, detail }
        : service),
      disclosure: 'Hugging Face inference is connected. Model output is advisory; canonical Product validation and human approval control revisions.',
    };
  }

  async checkHealth(options: { probe?: boolean } = {}): Promise<FormaInferenceStatus> {
    if (!this.config.token) return this.initialStatus();
    if (!options.probe) return this.lastStatus;
    try {
      await this.chat(this.config.reasoningModel, [
        { role: 'system', content: 'Return only the word ready.' },
        { role: 'user', content: 'Health check.' },
      ], 8);
      this.markConnected('reasoning', this.config.reasoningModel, 'A live completion succeeded.');
    } catch (error) {
      const detail = this.safeError(error);
      const mode = this.fallbackMode();
      this.lastStatus = {
        ...this.initialStatus(),
        checkedAt: new Date().toISOString(),
        services: this.initialStatus().services.map((service) => service.capability === 'reasoning' ? { ...service, detail } : service),
        disclosure: `Hugging Face probe failed: ${detail} Deterministic fallback is ${this.config.allowMockFallback ? 'active' : 'disabled'}.`,
        mode,
      };
    }
    return this.lastStatus;
  }

  async observeMedia(input: Parameters<FormaInferenceProvider['observeMedia']>[0]): Promise<FormaMediaObservation> {
    if (!input.dataUrl || !this.config.token) {
      if (this.config.allowMockFallback) return this.fallback.observeMedia(input);
      return { mode: 'unavailable', inferencePerformed: false, sourceId: input.sourceId, kind: input.kind, summary: 'Hugging Face vision is not configured for this input.', labels: [] };
    }
    try {
      const { text, payload } = await this.chat(this.config.visionModel, [
        {
          role: 'system',
          content: 'You inspect engineering hardware. Return JSON only: {"summary":"brief observation","labels":[{"label":"exact candidate label","confidence":0.0}]}. Never invent a candidate outside the supplied context.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: input.context || 'Identify the visible engineering component.' },
            { type: 'image_url', image_url: { url: input.dataUrl } },
          ],
        },
      ], 350);
      const parsed = parseJsonRecord(text);
      if (!parsed || typeof parsed.summary !== 'string') throw new Error('Vision output did not match the observation contract.');
      const labels = Array.isArray(parsed.labels)
        ? parsed.labels.flatMap((item) => {
            if (!item || typeof item !== 'object' || typeof (item as { label?: unknown }).label !== 'string') return [];
            return [{ label: (item as { label: string }).label, confidence: safeConfidence((item as { confidence?: unknown }).confidence) }];
          }).slice(0, 8)
        : [];
      this.markConnected('vision', this.config.visionModel, 'A live multimodal completion matched the observation contract.');
      return { mode: 'huggingface', inferencePerformed: true, sourceId: input.sourceId, kind: input.kind, summary: parsed.summary, labels, raw: { model: this.config.visionModel, response: payload } };
    } catch (error) {
      if (!this.config.allowMockFallback) return { mode: 'unavailable', inferencePerformed: false, sourceId: input.sourceId, kind: input.kind, summary: this.safeError(error), labels: [] };
      const fallback = await this.fallback.observeMedia(input);
      return { ...fallback, summary: `Hugging Face vision was unavailable: ${this.safeError(error)} ${fallback.summary}` };
    }
  }

  async reason<T>(input: Parameters<FormaInferenceProvider['reason']>[0] & { mockResult: T }): Promise<FormaReasoningResult<T>> {
    if (!this.config.token) {
      if (this.config.allowMockFallback) return this.fallback.reason(input);
      return { mode: 'unavailable', inferencePerformed: false, summary: 'HF_TOKEN is not configured.', structured: input.mockResult };
    }
    try {
      const { text, payload } = await this.chat(this.config.reasoningModel, [
        {
          role: 'system',
          content: 'You are an advisory engineering reasoning model. Never approve or commit a revision. Return JSON only with optional "answer" (string) and "reasoning" (array of concise strings). Cite only facts present in the supplied state.',
        },
        {
          role: 'user',
          content: JSON.stringify({ objective: input.objective, engineeringState: input.engineeringState, featureContract: input.featureContract }),
        },
      ]);
      const parsed = parseJsonRecord(text);
      const fallbackRecord = input.mockResult && typeof input.mockResult === 'object' ? input.mockResult as Record<string, unknown> : null;
      const structured = fallbackRecord && parsed
        ? {
            ...fallbackRecord,
            ...(typeof parsed.answer === 'string' && typeof fallbackRecord.answer === 'string' ? { answer: parsed.answer } : {}),
            ...(Array.isArray(parsed.reasoning) && parsed.reasoning.every((item) => typeof item === 'string') && Array.isArray(fallbackRecord.reasoning) ? { reasoning: parsed.reasoning.slice(0, 8) } : {}),
          } as T
        : input.mockResult;
      this.markConnected('reasoning', this.config.reasoningModel, 'A live advisory completion succeeded.');
      return { mode: 'huggingface', inferencePerformed: true, summary: `Hugging Face advisory reasoning completed with ${this.config.reasoningModel}.`, structured, raw: { model: this.config.reasoningModel, response: payload } };
    } catch (error) {
      if (!this.config.allowMockFallback) return { mode: 'unavailable', inferencePerformed: false, summary: this.safeError(error), structured: input.mockResult };
      const fallback = await this.fallback.reason(input);
      return { ...fallback, summary: `Hugging Face reasoning was unavailable: ${this.safeError(error)} ${fallback.summary}` };
    }
  }

  async parseDocument(input: Parameters<FormaInferenceProvider['parseDocument']>[0]): Promise<FormaReasoningResult<FormaDocumentArtifacts>> {
    const fallbackDocument = emptyDocument(input);
    const imageInput = input.dataUrl?.startsWith('data:image/') ? input.dataUrl : null;
    if (!this.config.token || (!input.text && !imageInput)) {
      if (this.config.allowMockFallback) return this.fallback.parseDocument(input);
      return { mode: 'unavailable', inferencePerformed: false, summary: 'Hugging Face document parsing requires extracted text or an image page.', structured: fallbackDocument };
    }
    try {
      const prompt = `Extract engineering facts from ${input.name}. Return JSON only with: title, artifactType, component, sections[{heading,text}], partNumbers[string], requirements[{key,value}], properties[{key,label,value}].`;
      const content: ChatContent = imageInput
        ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageInput } }]
        : `${prompt}\n\n${String(input.text).slice(0, 60_000)}`;
      const model = imageInput ? this.config.visionModel : this.config.reasoningModel;
      const { text, payload } = await this.chat(model, [
        { role: 'system', content: 'Extract only facts visible in the supplied source. Return valid JSON and do not infer missing specifications.' },
        { role: 'user', content },
      ], 1200);
      const parsed = parseJsonRecord(text);
      if (!parsed) throw new Error('Document output did not match the extraction contract.');
      const sections = Array.isArray(parsed.sections) ? parsed.sections.flatMap((item) => item && typeof item === 'object' && typeof (item as { heading?: unknown }).heading === 'string' && typeof (item as { text?: unknown }).text === 'string' ? [{ heading: (item as { heading: string }).heading, text: (item as { text: string }).text }] : []).slice(0, 12) : [];
      const partNumbers = Array.isArray(parsed.partNumbers) ? parsed.partNumbers.filter((item): item is string => typeof item === 'string').slice(0, 30) : [];
      const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.flatMap((item) => item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string' && typeof (item as { value?: unknown }).value === 'string' ? [{ key: (item as { key: string }).key, value: (item as { value: string }).value }] : []).slice(0, 30) : [];
      const properties = Array.isArray(parsed.properties) ? parsed.properties.flatMap((item) => item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string' && typeof (item as { label?: unknown }).label === 'string' && typeof (item as { value?: unknown }).value === 'string' ? [{ key: (item as { key: string }).key, label: (item as { label: string }).label, value: (item as { value: string }).value, sourceId: input.sourceId, sourceName: input.name }] : []).slice(0, 40) : [];
      const artifactTypeValues = new Set<FormaDocumentArtifacts['artifactType']>(['component-specification', 'bom', 'requirements', 'manual', 'engineering-document']);
      const artifactType = typeof parsed.artifactType === 'string' && artifactTypeValues.has(parsed.artifactType as FormaDocumentArtifacts['artifactType']) ? parsed.artifactType as FormaDocumentArtifacts['artifactType'] : 'engineering-document';
      const structured: FormaDocumentArtifacts = {
        sourceId: input.sourceId,
        title: typeof parsed.title === 'string' ? parsed.title : input.name,
        artifactType,
        component: typeof parsed.component === 'string' ? parsed.component : null,
        sections,
        partNumbers,
        requirements,
        properties,
      };
      this.markConnected('document-parse', model, 'A live source-grounded extraction matched the document contract.');
      return { mode: 'huggingface', inferencePerformed: true, summary: `Document facts extracted with ${model}.`, structured, raw: { model, response: payload } };
    } catch (error) {
      if (!this.config.allowMockFallback) return { mode: 'unavailable', inferencePerformed: false, summary: this.safeError(error), structured: fallbackDocument };
      const fallback = await this.fallback.parseDocument(input);
      return { ...fallback, summary: `Hugging Face document parsing was unavailable: ${this.safeError(error)} ${fallback.summary}` };
    }
  }
}
