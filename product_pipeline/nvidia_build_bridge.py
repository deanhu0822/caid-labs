"""Server-only bridge from Forma to the existing validated NVIDIA Build client.

The Next.js server sends one JSON request on stdin and receives one JSON result
on stdout. Credentials stay in the child process environment and are never
included in either payload. Structured responses reuse StructuredGenerator's
constraint ladder, Pydantic validation, semantic gates, repair loop, and final
accept/reject decision.
"""
from __future__ import annotations

import json
import os
import sys
import base64
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from structured_gen import (
    MODEL_PREFERENCES,
    MODES,
    NVIDIA_BASE_URL,
    StructuredGenerator,
    api_key,
    extract_json,
    list_models,
)


def _structured_mode() -> str:
    mode = os.environ.get("NVIDIA_BUILD_STRUCTURED_MODE", "auto").strip().lower()
    if mode != "auto" and mode not in MODES:
        raise RuntimeError(f"Invalid NVIDIA_BUILD_STRUCTURED_MODE '{mode}'")
    return mode


class AgentReasoning(BaseModel):
    answer: str
    reasoning: list[str]


class HealthResponse(BaseModel):
    ok: bool
    message: str


class ObservationLabel(BaseModel):
    label: str
    confidence: float = Field(ge=0, le=1)


class PhysicalObservation(BaseModel):
    summary: str
    labels: list[ObservationLabel]


class Requirement(BaseModel):
    key: str
    label: str
    value: str
    source: str
    sourceId: str | None = None
    sourceName: str | None = None


class MediaObservation(BaseModel):
    sourceId: str
    kind: Literal["image", "video"]
    summary: str
    inferenceConnected: bool


class DocumentProperty(BaseModel):
    key: str
    label: str
    value: str
    sourceId: str
    sourceName: str


class DocumentObservation(BaseModel):
    sourceId: str
    sourceName: str
    title: str
    artifactType: str
    component: str | None
    partNumbers: list[str]
    properties: list[DocumentProperty]
    mode: str
    inferencePerformed: bool
    parserRole: str
    summary: str


class PrototypeIntent(BaseModel):
    prototype: bool
    scenario: Literal["inspection-rover", "air-monitor", "camera-platform", "pick-and-place"]
    buildGoal: str
    goalSummary: str
    requirements: list[Requirement]
    missingDecisions: list[str]
    mediaObservations: list[MediaObservation]
    documentObservations: list[DocumentObservation]


class IntentEnhancement(BaseModel):
    buildGoal: str
    goalSummary: str
    requirements: list[Requirement]
    missingDecisions: list[str]


class Artifact(BaseModel):
    id: str
    label: str
    category: str
    code: str
    meta: str
    x: float
    y: float
    revision: str | None = None


class Relation(BaseModel):
    id: str
    source: str
    target: str
    kind: str


class DecisionOption(BaseModel):
    id: str
    label: str
    description: str


class NextDecision(BaseModel):
    title: str
    description: str
    options: list[DecisionOption]


class OpenCadState(BaseModel):
    connected: bool
    note: str


class PrototypeArchitecture(BaseModel):
    prototype: bool
    name: str
    slug: str
    assumptions: list[str]
    artifacts: list[Artifact]
    relations: list[Relation]
    nextDecision: NextDecision
    prototypeChecks: list[str]
    openCad: OpenCadState


class ArchitectureEnhancement(BaseModel):
    name: str
    assumptions: list[str]
    nextDecision: NextDecision
    prototypeChecks: list[str]


class ParsedSection(BaseModel):
    heading: str
    text: str


class ParsedRequirement(BaseModel):
    key: str
    value: str


class ParsedDocumentArtifact(BaseModel):
    sourceId: str
    title: str
    artifactType: Literal["component-specification", "bom", "requirements", "manual", "engineering-document"]
    component: str | None
    sections: list[ParsedSection]
    partNumbers: list[str]
    requirements: list[ParsedRequirement]
    properties: list[DocumentProperty]


class ExtractionPart(BaseModel):
    name: str
    quantity: int = Field(ge=1)
    material: str
    confidence: float = Field(ge=0, le=1)


class ExtractionDimension(BaseModel):
    label: str
    value_text: str
    unit: str
    confidence: float = Field(ge=0, le=1)


class ExtractionRisk(BaseModel):
    title: str
    severity: Literal["low", "medium", "high"]
    rationale: str
    mitigation: str
    confidence: float = Field(ge=0, le=1)


class ExtractionTask(BaseModel):
    title: str
    source: Literal["ai", "user"]


class EngineeringExtraction(BaseModel):
    parts: list[ExtractionPart]
    dimensions: list[ExtractionDimension]
    risks: list[ExtractionRisk]
    tasks: list[ExtractionTask]


def _prototype_intent_gate(value: PrototypeIntent) -> list[tuple[str, str]]:
    failures: list[tuple[str, str]] = []
    if not value.prototype:
        failures.append(("intent.prototype", "prototype must remain true"))
    if len(value.requirements) < 3:
        failures.append(("intent.requirements", "at least three requirements are required"))
    if not value.missingDecisions:
        failures.append(("intent.decisions", "at least one unresolved engineering decision is required"))
    return failures


def _prototype_architecture_gate(value: PrototypeArchitecture) -> list[tuple[str, str]]:
    failures: list[tuple[str, str]] = []
    if not value.prototype:
        failures.append(("architecture.prototype", "prototype must remain true"))
    if value.openCad.connected:
        failures.append(("architecture.opencad", "OpenCAD cannot be claimed connected by model output"))
    ids = [artifact.id for artifact in value.artifacts]
    if len(ids) < 6 or len(ids) != len(set(ids)):
        failures.append(("architecture.artifacts", "at least six uniquely identified artifacts are required"))
    known = set(ids)
    for relation in value.relations:
        if relation.source not in known or relation.target not in known:
            failures.append(("architecture.relation_ref", f"relation '{relation.id}' has an unknown endpoint"))
    return failures[:12]


def _reasoning_contract(payload: dict[str, Any]):
    feature_contract = payload.get("featureContract")
    output_kind = feature_contract.get("output") if isinstance(feature_contract, dict) else None
    if output_kind == "PrototypeIntent":
        return IntentEnhancement, [
            lambda value: [] if len(value.requirements) >= 3 else [("intent.requirements", "at least three requirements are required")],
            lambda value: [] if value.missingDecisions else [("intent.decisions", "at least one unresolved decision is required")],
        ], (
            "You are Forma's senior product systems engineer. Analyze every supplied text note, media observation, and "
            "document observation. Return precise build goal, summary, requirements, and unresolved decisions. Preserve "
            "source/sourceId/sourceName fields when a requirement came from an input. Return one JSON object only."
        )
    if output_kind == "PrototypeArchitecture":
        return ArchitectureEnhancement, [
            lambda value: [] if len(value.assumptions) >= 3 else [("architecture.assumptions", "at least three engineering assumptions are required")],
            lambda value: [] if value.nextDecision.options else [("architecture.decision", "decision options are required")],
        ], (
            "You are Forma's senior hardware architect. Use the supplied intent, media/document evidence, and clarification "
            "choices to improve the product name, explicit engineering assumptions, next decision, and validation checklist. "
            "Do not claim tests or CAD operations were completed. Return one JSON object only."
        )
    if output_kind == "EngineeringExtraction":
        return EngineeringExtraction, [
            lambda value: [] if value.parts or value.dimensions or value.risks else [("extraction.empty", "Extract at least one part, dimension, or risk.")],
        ], (
            "You are a manufacturing engineering reviewer. Convert only the supplied parsed document evidence into the "
            "requested structured extraction. Preserve units exactly, use conservative confidence values, identify genuine "
            "drawing/manufacturing risks, and do not invent missing values. Return the complete JSON object only."
        )
    return AgentReasoning, [
        lambda value: [] if value.answer.strip() else [("answer.empty", "Answer must not be empty.")],
        lambda value: [] if value.reasoning and all(item.strip() for item in value.reasoning) else [("reasoning.empty", "Provide at least one reasoning step.")],
    ], (
        "You are a careful engineering assistant. Use only the supplied engineering state. "
        "Do not invent part numbers, evidence, validation results, or graph changes. Return JSON only."
    )


def _model_extra_kwargs(model: str, *, thinking: bool) -> dict[str, Any]:
    if _structured_mode() == "free" and model.startswith("nvidia/nemotron-3-"):
        return {"extra_body": {"chat_template_kwargs": {"enable_thinking": thinking}}}
    return {}


def _clean_error(error: Exception) -> str:
    message = f"{type(error).__name__}: {str(error)}"
    key = api_key()
    if key:
        message = message.replace(key, "[redacted]")
    return message[:500]


def _client(base_url: str):
    from openai import OpenAI

    key = api_key()
    if not key:
        raise RuntimeError("NVIDIA_API_KEY is not configured")
    return OpenAI(base_url=base_url, api_key=key, timeout=90.0, max_retries=0)


def _select_model(available: list[str], requested: str | None) -> str:
    if requested:
        if requested in available:
            return requested
        matches = [model for model in available if requested.lower() in model.lower()]
        if matches:
            return matches[0]
        raise RuntimeError(f"Configured model '{requested}' is not callable with this account")
    for preference in MODEL_PREFERENCES:
        for model in available:
            if preference in model.lower():
                return model
    if not available:
        raise RuntimeError("NVIDIA Build returned no callable models")
    return available[0]


def _service(capability: str, requested: str | None, available: list[str]) -> dict[str, Any]:
    if not requested:
        return {
            "capability": capability,
            "configured": False,
            "model": "not configured",
            "modelAvailable": False,
            "adapterConnected": False,
        }
    try:
        selected = _select_model(available, requested)
    except RuntimeError as error:
        return {
            "capability": capability,
            "configured": True,
            "model": requested,
            "modelAvailable": False,
            "adapterConnected": False,
            "detail": str(error),
        }
    return {
        "capability": capability,
        "configured": True,
        "model": selected,
        "modelAvailable": True,
        "adapterConnected": False,
        "detail": "Model is listed, but this modality adapter has not been verified with a real request.",
    }


def status(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = str(payload.get("baseUrl") or NVIDIA_BASE_URL)
    if not api_key():
        return {
            "ok": False,
            "status": "unavailable",
            "keyPresent": False,
            "endpoint": base_url,
            "modelsListed": False,
            "probeSucceeded": False,
            "error": "NVIDIA_API_KEY is not configured",
        }
    try:
        client = _client(base_url)
        available = list_models(client)
        reasoning_model = _select_model(available, payload.get("reasoningModel"))
        probe_succeeded = False
        probe_report: dict[str, Any] | None = None
        if payload.get("probe"):
            generator = StructuredGenerator(
                output_model=HealthResponse,
                model=reasoning_model,
                client=client,
                system_prompt="Return a minimal JSON health acknowledgement.",
                gates=[lambda value: [] if value.ok else [("health.not_ok", "The model did not acknowledge the probe.")]],
                mode=_structured_mode(),
                attempts=1,
                max_tokens=128,
                temperature=0.0,
                extra_kwargs=_model_extra_kwargs(reasoning_model, thinking=False),
            )
            result = generator.generate('Return {"ok": true, "message": "ready"}.')
            probe_succeeded = result.ok
            probe_report = result.report()
        services = [
            {
                "capability": "reasoning",
                "configured": True,
                "model": reasoning_model,
                "modelAvailable": True,
                "adapterConnected": probe_succeeded,
                "detail": "Validated response received." if probe_succeeded else "Model discovered; run the probe to verify a response.",
            },
            _service("vision", payload.get("visionModel"), available),
            _service("document-parse", payload.get("parseModel"), available),
        ]
        probe_requested = bool(payload.get("probe"))
        return {
            "ok": not probe_requested or probe_succeeded,
            "status": "connected" if probe_succeeded else "unavailable" if probe_requested else "available_unprobed",
            "keyPresent": True,
            "endpoint": base_url,
            "modelsListed": True,
            "modelCount": len(available),
            "probeSucceeded": probe_succeeded,
            "probeReport": probe_report,
            "services": services,
            "error": "NVIDIA Build response probe was rejected" if probe_requested and not probe_succeeded else None,
        }
    except Exception as error:  # noqa: BLE001 - adapter failures must become honest status
        return {
            "ok": False,
            "status": "unavailable",
            "keyPresent": True,
            "endpoint": base_url,
            "modelsListed": False,
            "probeSucceeded": False,
            "error": _clean_error(error),
        }


def observe(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = str(payload.get("baseUrl") or NVIDIA_BASE_URL)
    data_url = payload.get("dataUrl")
    kind = payload.get("kind")
    if not api_key():
        return {"ok": False, "error": "NVIDIA_API_KEY is not configured"}
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return {"ok": False, "error": "A media data URL is required"}
    if kind not in {"image", "video", "physical-state"}:
        return {"ok": False, "error": "Unsupported media kind"}
    try:
        client = _client(base_url)
        available = list_models(client)
        model = _select_model(available, payload.get("visionModel"))
        media_type = "video_url" if kind == "video" else "image_url"
        context = str(payload.get("context") or "Identify the engineering hardware and visible condition.")
        prompt = (
            f"{context}\nReturn one JSON object with summary and labels. Each label has label and confidence (0 to 1). "
            "If candidate labels are supplied, use their exact label text. Do not invent a graph match when uncertain."
        )
        last_error = "Vision response was not valid structured JSON"
        for attempt in range(2):
            response = client.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": media_type, media_type: {"url": data_url}},
                        {"type": "text", "text": prompt if attempt == 0 else prompt + "\nYour prior response was invalid. Return JSON only."},
                    ],
                }],
                temperature=0.2,
                max_tokens=1400,
            )
            content = response.choices[0].message.content or ""
            data, parse_error = extract_json(content)
            if data is None:
                last_error = parse_error
                continue
            try:
                value = PhysicalObservation.model_validate(data)
            except ValidationError as error:
                last_error = str(error)[:400]
                continue
            return {
                "ok": True,
                "model": model,
                "structured": value.model_dump(),
                "report": {"ok": True, "attempts": attempt + 1, "mode_used": "multimodal-free-json"},
            }
        return {"ok": False, "model": model, "error": last_error}
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "error": _clean_error(error)}


def _document_images(data_url: str) -> list[str]:
    header, encoded = data_url.split(",", 1)
    if "application/pdf" not in header.lower():
        return [data_url]
    import pymupdf as fitz

    document = fitz.open(stream=base64.b64decode(encoded), filetype="pdf")
    images: list[str] = []
    for page_index in range(min(4, document.page_count)):
        pixmap = document.load_page(page_index).get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
        images.append("data:image/png;base64," + base64.b64encode(pixmap.tobytes("png")).decode("ascii"))
    document.close()
    return images


def parse_document(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = str(payload.get("baseUrl") or NVIDIA_BASE_URL)
    data_url = payload.get("dataUrl")
    source_id = str(payload.get("sourceId") or "document")
    source_name = str(payload.get("name") or "Engineering document")
    if not api_key():
        return {"ok": False, "error": "NVIDIA_API_KEY is not configured"}
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        return {"ok": False, "error": "A document data URL is required"}
    try:
        client = _client(base_url)
        available = list_models(client)
        parse_model = _select_model(available, payload.get("parseModel"))
        pages = _document_images(data_url)
        extracted_pages: list[str] = []
        for index, image_url in enumerate(pages):
            response = client.chat.completions.create(
                model=parse_model,
                tools=[{"type": "function", "function": {"name": "markdown_no_bbox"}}],
                messages=[{"role": "user", "content": [{"type": "image_url", "image_url": {"url": image_url}}]}],
                max_tokens=6000,
            )
            message = response.choices[0].message
            page_text = message.content or ""
            tool_calls = getattr(message, "tool_calls", None) or []
            if tool_calls:
                arguments = getattr(tool_calls[0].function, "arguments", "") or ""
                try:
                    decoded = json.loads(arguments)
                    if isinstance(decoded, list) and decoded and isinstance(decoded[0], dict):
                        page_text = str(decoded[0].get("text") or page_text)
                    elif isinstance(decoded, dict):
                        page_text = str(decoded.get("text") or page_text)
                except json.JSONDecodeError:
                    page_text = arguments or page_text
            extracted_pages.append(f"## Page {index + 1}\n{page_text}")
        parsed_text = "\n\n".join(extracted_pages)[:80_000]
        generation_model = _select_model(available, payload.get("generationModel") or payload.get("reasoningModel"))

        def provenance_gate(value: ParsedDocumentArtifact):
            failures: list[tuple[str, str]] = []
            if value.sourceId != source_id:
                failures.append(("document.source", f"sourceId must be '{source_id}'"))
            if not value.sections:
                failures.append(("document.sections", "At least one parsed section is required"))
            for prop in value.properties:
                if prop.sourceId != source_id or prop.sourceName != source_name:
                    failures.append(("document.property_source", f"Property '{prop.key}' has incorrect provenance"))
            return failures[:12]

        generator = StructuredGenerator(
            output_model=ParsedDocumentArtifact,
            model=generation_model,
            client=client,
            system_prompt=(
                "Normalize the parsed engineering document into structured artifacts. Use only supplied text. Preserve exact "
                "part numbers, units, requirements, and provenance. Do not infer values that are absent. Return JSON only."
            ),
            gates=[provenance_gate],
            mode=_structured_mode(),
            attempts=3,
            max_tokens=5000,
            temperature=0.1,
            extra_kwargs=_model_extra_kwargs(generation_model, thinking=True),
        )
        output_template = {
            "sourceId": source_id,
            "title": source_name,
            "artifactType": "engineering-document",
            "component": None,
            "sections": [{"heading": "Document", "text": "parsed evidence"}],
            "partNumbers": [],
            "requirements": [{"key": "requirement-key", "value": "exact document value"}],
            "properties": [{"key": "property-key", "label": "Property", "value": "exact document value", "sourceId": source_id, "sourceName": source_name}],
        }
        result = generator.generate(json.dumps({"requiredOutputTemplate": output_template, "parsedPages": parsed_text}, ensure_ascii=False))
        if not result.ok or result.value is None:
            return {"ok": False, "model": parse_model, "report": result.report(), "error": "Parsed document normalization was rejected"}
        return {
            "ok": True,
            "model": parse_model,
            "normalizationModel": generation_model,
            "structured": result.value.model_dump(),
            "parsedText": parsed_text,
            "report": result.report(),
        }
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "error": _clean_error(error)}


def reason(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = str(payload.get("baseUrl") or NVIDIA_BASE_URL)
    if not api_key():
        return {"ok": False, "error": "NVIDIA_API_KEY is not configured"}
    try:
        client = _client(base_url)
        available = list_models(client)
        output_model, gates, system_prompt = _reasoning_contract(payload)
        feature_contract = payload.get("featureContract")
        output_kind = feature_contract.get("output") if isinstance(feature_contract, dict) else None
        requested_model = payload.get("generationModel") if output_kind in {"PrototypeIntent", "PrototypeArchitecture", "EngineeringExtraction"} else payload.get("reasoningModel")
        model = _select_model(available, requested_model)
        generator = StructuredGenerator(
            output_model=output_model,
            model=model,
            client=client,
            system_prompt=system_prompt,
            gates=gates,
            mode=_structured_mode(),
            attempts=3,
            max_tokens=5000,
            temperature=0.2,
            extra_kwargs=_model_extra_kwargs(model, thinking=True),
        )
        prompt = json.dumps(
            {
                "objective": payload.get("objective"),
                "engineeringState": payload.get("engineeringState"),
                "featureContract": payload.get("featureContract"),
                "safeStartingPoint": payload.get("mockResult"),
            },
            ensure_ascii=False,
        )
        result = generator.generate(prompt)
        if not result.ok or result.value is None:
            return {"ok": False, "model": model, "report": result.report(), "error": "Structured response was rejected"}
        return {
            "ok": True,
            "model": model,
            "outputKind": (payload.get("featureContract") or {}).get("output") if isinstance(payload.get("featureContract"), dict) else None,
            "structured": result.value.model_dump(),
            "report": result.report(),
        }
    except Exception as error:  # noqa: BLE001 - surfaced to explicit fallback
        return {"ok": False, "error": _clean_error(error)}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        request = json.loads(sys.stdin.read() or "{}")
        action = request.get("action")
        payload = request.get("payload") or {}
        if action == "status":
            response = status(payload)
        elif action == "observe":
            response = observe(payload)
        elif action == "parse":
            response = parse_document(payload)
        elif action == "reason":
            response = reason(payload)
        else:
            response = {"ok": False, "error": "Unknown bridge action"}
    except Exception as error:  # noqa: BLE001
        response = {"ok": False, "error": _clean_error(error)}
    serialized = json.dumps(response, ensure_ascii=False)
    key = api_key()
    if key:
        serialized = serialized.replace(key, "[redacted]")
    sys.stdout.write(serialized)
    return 0 if response.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
