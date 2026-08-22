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
from typing import Any

from pydantic import BaseModel

from structured_gen import (
    MODEL_PREFERENCES,
    NVIDIA_BASE_URL,
    StructuredGenerator,
    api_key,
    list_models,
)


class AgentReasoning(BaseModel):
    answer: str
    reasoning: list[str]


class HealthResponse(BaseModel):
    ok: bool
    message: str


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
    return OpenAI(base_url=base_url, api_key=key, timeout=30.0, max_retries=0)


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
                attempts=1,
                max_tokens=128,
                temperature=0.0,
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


def reason(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = str(payload.get("baseUrl") or NVIDIA_BASE_URL)
    if not api_key():
        return {"ok": False, "error": "NVIDIA_API_KEY is not configured"}
    try:
        client = _client(base_url)
        available = list_models(client)
        model = _select_model(available, payload.get("reasoningModel"))
        generator = StructuredGenerator(
            output_model=AgentReasoning,
            model=model,
            client=client,
            system_prompt=(
                "You are a careful engineering assistant. Use only the supplied engineering state. "
                "Do not invent part numbers, evidence, validation results, or graph changes. Return JSON only."
            ),
            gates=[
                lambda value: [] if value.answer.strip() else [("answer.empty", "Answer must not be empty.")],
                lambda value: [] if value.reasoning and all(item.strip() for item in value.reasoning) else [("reasoning.empty", "Provide at least one reasoning step.")],
            ],
            attempts=3,
            max_tokens=1800,
            temperature=0.2,
        )
        prompt = json.dumps(
            {
                "objective": payload.get("objective"),
                "engineeringState": payload.get("engineeringState"),
                "featureContract": payload.get("featureContract"),
            },
            ensure_ascii=False,
        )
        result = generator.generate(prompt)
        if not result.ok or result.value is None:
            return {"ok": False, "model": model, "report": result.report(), "error": "Structured response was rejected"}
        return {
            "ok": True,
            "model": model,
            "structured": result.value.model_dump(),
            "report": result.report(),
        }
    except Exception as error:  # noqa: BLE001 - surfaced to explicit fallback
        return {"ok": False, "error": _clean_error(error)}


def main() -> int:
    try:
        request = json.loads(sys.stdin.read() or "{}")
        action = request.get("action")
        payload = request.get("payload") or {}
        if action == "status":
            response = status(payload)
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
