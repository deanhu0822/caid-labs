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
import { runNvidiaBuildBridge } from './nvidia-build-bridge.server';

export type NvidiaBuildInferenceConfig = {
  baseUrl: string;
  reasoningModel?: string;
  visionModel?: string;
  parseModel?: string;
  keyPresent: boolean;
  allowMockFallback: boolean;
};

export class NvidiaBuildInferenceProvider implements FormaInferenceProvider {
  readonly name = 'nvidia-build' as const;
  private readonly fallback = new MockFormaInferenceProvider();
  private lastStatus: FormaInferenceStatus;

  constructor(private readonly config: NvidiaBuildInferenceConfig) {
    this.lastStatus = this.initialStatus();
  }

  private initialStatus(): FormaInferenceStatus {
    const fallbackMode = this.config.allowMockFallback ? 'mock' as const : 'unavailable' as const;
    return {
      mode: fallbackMode,
      provider: this.name,
      connected: false,
      endpoint: this.config.baseUrl,
      disclosure: this.config.keyPresent
        ? 'NVIDIA Build is configured but has not been checked. Deterministic fallback remains explicit.'
        : 'NVIDIA_API_KEY is missing. Deterministic fallback remains explicit.',
      services: [
        { capability: 'reasoning', mode: fallbackMode, model: this.config.reasoningModel || 'auto-discover', endpointConfigured: this.config.keyPresent, connected: false },
        { capability: 'vision', mode: fallbackMode, model: this.config.visionModel || 'not configured', endpointConfigured: Boolean(this.config.visionModel && this.config.keyPresent), connected: false },
        { capability: 'document-parse', mode: fallbackMode, model: this.config.parseModel || 'not configured', endpointConfigured: Boolean(this.config.parseModel && this.config.keyPresent), connected: false },
      ],
    };
  }

  getStatus() {
    return this.lastStatus;
  }

  async checkHealth(options: { probe?: boolean } = {}): Promise<FormaInferenceStatus> {
    const result = await runNvidiaBuildBridge({
      action: 'status',
      payload: {
        baseUrl: this.config.baseUrl,
        reasoningModel: this.config.reasoningModel,
        visionModel: this.config.visionModel,
        parseModel: this.config.parseModel,
        probe: Boolean(options.probe),
      },
    });
    const fallbackMode = this.config.allowMockFallback ? 'mock' as const : 'unavailable' as const;
    const services: FormaInferenceServiceStatus[] = result.services?.map((service) => ({
      capability: service.capability,
      mode: service.capability === 'reasoning' && service.adapterConnected ? 'nvidia-build' : fallbackMode,
      model: service.model,
      endpointConfigured: service.configured,
      connected: service.adapterConnected,
      detail: service.detail,
    })) ?? this.initialStatus().services.map((service) => ({ ...service, detail: result.error }));
    const reasoningConnected = services.some((service) => service.capability === 'reasoning' && service.connected);
    this.lastStatus = {
      mode: reasoningConnected ? 'nvidia-build' : fallbackMode,
      provider: this.name,
      connected: reasoningConnected,
      endpoint: result.endpoint || this.config.baseUrl,
      checkedAt: new Date().toISOString(),
      services,
      disclosure: reasoningConnected
        ? 'NVIDIA Build returned a schema-validated health response.'
        : result.ok
          ? 'NVIDIA Build models were discovered; response probe has not succeeded. Deterministic fallback is active.'
          : `NVIDIA Build unavailable${result.error ? `: ${result.error}` : ''}. Deterministic fallback is ${this.config.allowMockFallback ? 'active' : 'disabled'}.`,
    };
    return this.lastStatus;
  }

  async observeMedia(input: Parameters<FormaInferenceProvider['observeMedia']>[0]): Promise<FormaMediaObservation> {
    if (this.config.allowMockFallback) {
      const fallback = await this.fallback.observeMedia(input);
      return { ...fallback, summary: `NVIDIA Build vision is not verified for this deployment. ${fallback.summary}` };
    }
    return { mode: 'unavailable', inferencePerformed: false, sourceId: input.sourceId, kind: input.kind, summary: 'NVIDIA Build vision is not verified for this deployment.', labels: [] };
  }

  async reason<T>(input: Parameters<FormaInferenceProvider['reason']>[0] & { mockResult: T }): Promise<FormaReasoningResult<T>> {
    const result = await runNvidiaBuildBridge({
      action: 'reason',
      payload: {
        baseUrl: this.config.baseUrl,
        reasoningModel: this.config.reasoningModel,
        objective: input.objective,
        engineeringState: input.engineeringState,
        featureContract: input.featureContract,
      },
    });
    if (result.ok && result.structured && typeof input.mockResult === 'object' && input.mockResult !== null) {
      const structured = {
        ...input.mockResult,
        ...(typeof result.structured.answer === 'string' ? { answer: result.structured.answer } : {}),
        ...(Array.isArray(result.structured.reasoning) && result.structured.reasoning.every((item) => typeof item === 'string') ? { reasoning: result.structured.reasoning } : {}),
      } as T;
      return {
        mode: 'nvidia-build',
        inferencePerformed: true,
        summary: `NVIDIA Build structured reasoning accepted with model ${result.model}.`,
        structured,
        raw: { validation: result.report, model: result.model },
      };
    }
    if (this.config.allowMockFallback) {
      const fallback = await this.fallback.reason(input);
      return { ...fallback, summary: `NVIDIA Build unavailable${result.error ? `: ${result.error}` : ''}. ${fallback.summary}` };
    }
    return { mode: 'unavailable', inferencePerformed: false, summary: result.error || 'NVIDIA Build reasoning failed.', structured: input.mockResult };
  }

  async parseDocument(input: Parameters<FormaInferenceProvider['parseDocument']>[0]): Promise<FormaReasoningResult<FormaDocumentArtifacts>> {
    if (this.config.allowMockFallback) {
      const fallback = await this.fallback.parseDocument(input);
      return { ...fallback, summary: `NVIDIA Build Parse 2.0 is not verified for this deployment. ${fallback.summary}` };
    }
    return {
      mode: 'unavailable',
      inferencePerformed: false,
      summary: 'NVIDIA Build Parse 2.0 is not verified; configure a callable hosted model or FORMA_PARSE_URL for a local NIM.',
      structured: { sourceId: input.sourceId, title: input.name, artifactType: 'engineering-document', component: null, sections: [], partNumbers: [], requirements: [], properties: [] },
    };
  }
}
