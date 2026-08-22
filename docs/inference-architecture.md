# Forma data and inference boundaries

Forma Labs has three deliberately separate data layers:

1. `product_pipeline/schema.py::Product` is the canonical manufacturable-product record. `product_pipeline/validate.py` is the authoritative semantic validator. A Product candidate must pass both Pydantic validation and every semantic gate before Forma can commit it as a revision.
2. `synthetic-assets/rover-alpha/features/*.json` contains workflow examples and UI evidence. Feature JSON can describe a request, impact analysis, validation result, or revision transition, but it is not a second Product database.
3. The React reducer and product graph are shared projections of the accepted Product plus current workflow state. Beginner and Pro read the same `EngineeringState`; neither view owns a separate engineering record.

The teammate-provided `schema.py`, `structured_gen.py`, and `validate.py` remain the structured-generation and validation core. `product_pipeline/forma_bridge.py` builds deterministic candidates, calls the canonical schema and gates, and writes accepted JSON plus `dataset/validation_manifest.json`. `product_pipeline/nvidia_build_bridge.py` reuses `StructuredGenerator` for hosted reasoning, including its `json_schema -> guided_json -> json_object -> free` constraint ladder, Pydantic validation, semantic gates, repair attempts, and accept/reject report. The frontend adapter rejects a Product candidate unless the manifest records schema pass, semantic-gate pass, zero failures, and a matching revision.

## Inference abstraction

One server-configured `FormaInferenceProvider` interface covers assisted reasoning, physical-media observation, and document parsing. `FORMA_INFERENCE_PROVIDER` selects `mock`, `nvidia-build`, or `local`; the UI has no provider URL, model ID, or credential. Model output is advisory until it has been normalized into a Product candidate and accepted by the Python validation boundary.

| Capability | Intended model | Environment variable |
| --- | --- | --- |
| Engineering reasoning and orchestration | Dynamically verified against NVIDIA Build | `NVIDIA_REASONING_MODEL` or `FORMA_REASONING_URL` |
| Hardware image, video, and physical-state observation | Cosmos-compatible model only after a verified request | `NVIDIA_VISION_MODEL` or `FORMA_VISION_URL` |
| Engineering documents, drawings, datasheets, BOMs, and manuals | Parse 2.0 only after a verified request | `NVIDIA_PARSE_MODEL` or `FORMA_PARSE_URL` |

NVIDIA Build defaults to `https://integrate.api.nvidia.com/v1`, but every model ID is discovered and checked against the account instead of being hard-coded into UI code. `GET /api/inference/status` performs a server-side model-list check; `?probe=1` also requests and validates a tiny response. It reports provider, resolved model, connection state, and sanitized errors, never the key. Missing or invalid credentials use the deterministic fallback only when `NVIDIA_BUILD_ALLOW_MOCK_FALLBACK=true`, and every result retains `inferencePerformed: false`.

Vision and Parse 2.0 stay explicitly unavailable/mock until their configured model is both listed and exercised through the relevant adapter. A model name alone is not treated as proof of a hosted capability. A later local NIM deployment only changes `FORMA_INFERENCE_PROVIDER=local` and the `FORMA_*_URL` values; shared agent and engineering-state code does not change.

Integration paths:

- Builder and the three agents receive the same validated Product context used by the graph: requirements, component IDs, relationships, circuit nets, fabrication processes, instruction steps, sourcing records, revision, and validation status.
- Agent prose may be locally assisted, but artifact IDs, evidence, task matches, mode, and structured Product context are protected fields.
- Scanner photos and videos pass through `observeMedia` and are intended for Cosmos. The current mock uses explicit fixtures or human confirmation and never claims pixel inference.
- Documents call `parseDocument` and are intended for Parse 2.0. Per-fact source IDs and filenames are retained.
- The `engineering_test_assets` harness classifies its PDFs and derived drawing-page PNGs as Documents. Its current prototype returns clearly labeled golden fixtures; it never presents them as model output.
- Geometry is a separate local OpenCAD realization boundary. It does not replace Product validation.

## Revision rule

`EngineeringState` stores the accepted `ValidatedProductState`. The reducer does not advance a revision for a rejected, unvalidated, or missing Product candidate. The payload, camera-mount, J12, and runtime demo candidates all come from the same canonical Rev C Product and are present in the validation manifest before the UI can commit them.
