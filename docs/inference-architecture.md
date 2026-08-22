# Forma data and inference boundaries

Forma Labs has three deliberately separate data layers:

1. `product_pipeline/schema.py::Product` is the canonical manufacturable-product record. `product_pipeline/validate.py` is the authoritative semantic validator. A Product candidate must pass both Pydantic validation and every semantic gate before Forma can commit it as a revision.
2. `synthetic-assets/rover-alpha/features/*.json` contains workflow examples and UI evidence. Feature JSON can describe a request, impact analysis, validation result, or revision transition, but it is not a second Product database.
3. The React reducer and product graph are shared projections of the accepted Product plus current workflow state. Beginner and Pro read the same `EngineeringState`; neither view owns a separate engineering record.

The teammate-provided `schema.py`, `structured_gen.py`, and `validate.py` remain unmodified. `product_pipeline/forma_bridge.py` is the only Forma-specific adapter: it builds deterministic candidates, calls the canonical schema and gates, and writes accepted JSON plus `dataset/validation_manifest.json`. The frontend adapter rejects a candidate unless the manifest records schema pass, semantic-gate pass, zero failures, and a matching revision.

## Inference abstraction

One server-configured `FormaInferenceProvider` interface covers assisted reasoning, physical-media observation, and document parsing. Model output is advisory until it has been normalized into a Product candidate and accepted by the Python validation boundary.

| Capability | Intended model | Environment variable |
| --- | --- | --- |
| Engineering reasoning and orchestration | Llama-3.1-Nemotron-70B-Instruct | `FORMA_REASONING_URL` |
| Hardware image, video, and physical-state observation | Cosmos-Reason1-7B | `FORMA_VISION_URL` |
| Engineering documents, drawings, datasheets, BOMs, and manuals | `nvidia/NVIDIA-Nemotron-Parse-2.0` | `FORMA_PARSE_URL` |

Endpoints are server-side configuration. UI components contain no model URL or model-selection logic. Missing endpoints use the deterministic mock provider and report `mode: "mock"` with `inferencePerformed: false`; `GET /api/inference/status` exposes that state. Forma does not download or initialize a model.

Integration paths:

- Builder and the three agents receive the same validated Product context used by the graph: requirements, component IDs, relationships, circuit nets, fabrication processes, instruction steps, sourcing records, revision, and validation status.
- Agent prose may be locally assisted, but artifact IDs, evidence, task matches, mode, and structured Product context are protected fields.
- Scanner photos and videos pass through `observeMedia` and are intended for Cosmos. The current mock uses explicit fixtures or human confirmation and never claims pixel inference.
- Documents call `parseDocument` and are intended for Parse 2.0. Per-fact source IDs and filenames are retained.
- The `engineering_test_assets` harness classifies its PDFs and derived drawing-page PNGs as Documents. Its current prototype returns clearly labeled golden fixtures; it never presents them as model output.
- Geometry is a separate local OpenCAD realization boundary. It does not replace Product validation.

## Revision rule

`EngineeringState` stores the accepted `ValidatedProductState`. The reducer does not advance a revision for a rejected, unvalidated, or missing Product candidate. The payload, camera-mount, J12, and runtime demo candidates all come from the same canonical Rev C Product and are present in the validation manifest before the UI can commit them.
