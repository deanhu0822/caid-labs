# Forma data and inference boundaries

Forma Labs has three deliberately separate data layers:

1. `product_pipeline/schema.py::Product` is the canonical manufacturable-product record. `product_pipeline/validate.py` is the authoritative semantic validator. A Product candidate must pass both Pydantic validation and every semantic gate before Forma can commit it as a revision.
2. `synthetic-assets/rover-alpha/features/*.json` contains workflow examples and UI evidence. Feature JSON can describe a request, impact analysis, validation result, or revision transition, but it is not a second Product database.
3. The React reducer and product graph are shared projections of the accepted Product plus current workflow state. Beginner and Pro read the same `EngineeringState`; neither view owns a separate engineering record.

The teammate-provided `schema.py`, `structured_gen.py`, and `validate.py` remain the structured-generation and validation core. `product_pipeline/forma_bridge.py` builds deterministic candidates, calls the canonical schema and gates, and writes accepted JSON plus `dataset/validation_manifest.json`. `product_pipeline/nvidia_build_bridge.py` reuses `StructuredGenerator` for hosted reasoning, including its `json_schema -> guided_json -> json_object -> free` constraint ladder, Pydantic validation, semantic gates, repair attempts, and accept/reject report. The frontend adapter rejects a Product candidate unless the manifest records schema pass, semantic-gate pass, zero failures, and a matching revision.

## Inference abstraction

One server-configured `FormaInferenceProvider` interface covers assisted reasoning, physical-media observation, and document parsing. `FORMA_INFERENCE_PROVIDER` selects `mock`, `huggingface`, `nvidia-build`, or `local`; the UI has no provider URL, model ID, or credential. Model output is advisory until it has been normalized into a Product candidate and accepted by the Python validation boundary.

The Vercel configuration defaults to Hugging Face Inference Providers because its OpenAI-compatible router supports both chat models and vision-language models without bundling model weights into the serverless function. `HF_TOKEN` must be configured in Vercel with the **Make calls to Inference Providers** permission. Without it, the app stays usable through the explicitly labeled deterministic demo; no live-model claim is shown.

| Capability | Intended model | Environment variable |
| --- | --- | --- |
| Engineering reasoning and agent orchestration | Nemotron 3 Ultra (or another verified account model) | `NVIDIA_REASONING_MODEL` or `FORMA_REASONING_URL` |
| Schema-constrained intent, architecture, and extraction | Nemotron 3 Super (or another verified account model) | `NVIDIA_GENERATION_MODEL` |
| Hardware image and physical-state observation | Llama 3.2 90B Vision, selected only after a successful account request | `NVIDIA_VISION_MODEL` or `FORMA_VISION_URL` |
| Engineering documents, drawings, datasheets, BOMs, and manuals | Nemotron Parse | `NVIDIA_PARSE_MODEL` or `FORMA_PARSE_URL` |

For the Hugging Face provider, `HF_REASONING_MODEL` defaults to `openai/gpt-oss-120b:fastest` and `HF_VISION_MODEL` defaults to `Qwen/Qwen2.5-VL-3B-Instruct:fastest`. Both are deployment configuration, not trusted engineering authorities. The provider can improve advisory prose and match uploaded media to candidate labels; it cannot set protected artifact IDs, pass semantic gates, approve a change, or commit a revision.

NVIDIA Build defaults to `https://integrate.api.nvidia.com/v1`, but every model ID is discovered and checked against the account instead of being hard-coded into UI code. `GET /api/inference/status` performs a server-side model-list check; `?probe=1` also requests and validates a tiny response. It reports provider, resolved model, connection state, and sanitized errors, never the key. Missing or invalid credentials use the deterministic fallback only when `NVIDIA_BUILD_ALLOW_MOCK_FALLBACK=true`, and every result retains `inferencePerformed: false`.

Vision and Parse stay explicitly unavailable/mock until their configured model is both listed and exercised through the relevant adapter. A model name alone is not treated as proof of a hosted capability. Cosmos is not advertised as connected when the account returns an unavailable-function response; Forma uses the strongest vision model that passed a real request instead. A later local NIM deployment only changes `FORMA_INFERENCE_PROVIDER=local` and the `FORMA_*_URL` values; shared agent and engineering-state code does not change.

The NVIDIA bridge runs server-side in Python so the existing Pydantic contracts and semantic gates remain authoritative. Local development installs `product_pipeline/requirements-inference.txt` and points `FORMA_PYTHON_BIN` at that interpreter. On Vercel, the Node routes automatically call the protected Python Function at `/api/nvidia_bridge`; its dependencies come from the root `requirements.txt`. A separate deployment can set `FORMA_NVIDIA_BRIDGE_URL` instead. The bridge request is authenticated with a one-way token derived from the server-only NVIDIA key. Credentials and model IDs belong in deployment environment variables, never client bundles.

## NemoClaw generation boundary

NemoClaw is a separate orchestration/backend path and does not replace the NVIDIA Build, local NIM, or mock inference providers. Browser code sends Forma's existing Start-from-Scratch generation request to `POST /api/generate`. The server-only adapter reads `NEMOCLAW_BACKEND_URL`, removes trailing slashes, appends `/generate`, and forwards the original request bytes and content type.

The proxy streams the NemoClaw response body without assuming JSON and preserves its HTTP status, `Content-Type`, and `Content-Disposition` (plus safe cache/file metadata). The client helper therefore returns a `Blob`; callers can use `blob.type` and `blob.size`, download binary/CAD/archive outputs, or opt into `parseNemoClawJson` for JSON. Missing configuration returns 503, an unreachable backend returns 502, and NemoClaw error responses keep their original non-200 status. No automatic mock fallback occurs on this path.

Integration paths:

- Builder and the three agents receive the same validated Product context used by the graph: requirements, component IDs, relationships, circuit nets, fabrication processes, instruction steps, sourcing records, revision, and validation status.
- Agent prose may be locally assisted, but artifact IDs, evidence, task matches, mode, and structured Product context are protected fields.
- Scanner photos pass their actual pixels through `observeMedia`. Videos are decoded in the browser into a four-frame timeline contact sheet; those derived pixels are analyzed while the original video name, MIME type, size, and modality remain in provenance. Explicit filename fixtures or human confirmation are labeled as fallback and never presented as vision output.
- Documents call `parseDocument`; PDF pages are rendered for Nemotron Parse, then normalized into source-linked engineering facts. Per-fact source IDs and filenames are retained.
- The `engineering_test_assets` harness classifies its PDFs and derived drawing-page PNGs as Documents. With NVIDIA configured it runs real Parse plus structured extraction and validation; otherwise it returns clearly labeled golden fixtures. Results are preview-only until the user commits them.
- Geometry is a separate local OpenCAD realization boundary. It does not replace Product validation.

## Revision rule

`EngineeringState` stores the accepted `ValidatedProductState`. The reducer does not advance a revision for a rejected, unvalidated, or missing Product candidate. The payload, camera-mount, J12, and runtime demo candidates all come from the same canonical Rev C Product and are present in the validation manifest before the UI can commit them.

## Concrete demo workflow

`POST /api/workflow/demo` builds a server-side execution receipt for the payload scenario. It verifies revision lineage, the canonical validation manifest, the minimal-change boundary, visible tradeoffs, and evidence links. Hugging Face or NVIDIA may narrate the result, but the receipt's proof, candidate hashes, approval state, and artifact lists are protected deterministic fields.

The walkthrough now follows **observe → understand → trace → propose → validate → approve → commit → learn**. It pauses at approval. A second request with the same run ID re-runs the deterministic checks and returns a committed receipt only when the candidate remains eligible; the browser then advances the shared engineering state to Rev D.
