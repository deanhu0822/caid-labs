# Forma inference boundary

Forma Labs uses one `FormaInferenceProvider` interface for assisted reasoning, physical-media observation, and future document parsing. The product graph, reducer state, validation rules, and committed feature JSON remain authoritative; model output is advisory.

Current builds use `MockFormaInferenceProvider`. Its results are deterministic and always report `mode: "mock"` with `inferencePerformed: false`. The UI must not describe these results as real AI inference.

`NvidiaLocalInferenceProvider` is the GB10 integration boundary:

| Capability | Intended model | Environment variable |
| --- | --- | --- |
| Engineering reasoning and orchestration | Llama-3.1-Nemotron-70B-Instruct | `FORMA_REASONING_URL` |
| Image, video, and physical-state observation | Cosmos-Reason1-7B | `FORMA_VISION_URL` |
| Engineering document extraction | Nemotron-Parse-2.0 | `FORMA_PARSE_URL` |

Endpoints are server-side configuration. Do not place model URLs or model-selection controls in the browser UI. Missing endpoints fall back to the mock provider and are reported explicitly by `GET /api/inference/status`. No model is downloaded or initialized by the application.

Integration paths:

- Guided new-build text and media interpretation use the provider contract.
- Agent chat passes its corpus-grounded result through the reasoning boundary; artifact IDs, evidence, matched tasks, and graph mode remain protected source fields.
- Scanner uploads pass through `observeMedia`; the current mock only uses filename-label fixtures or user confirmation.
- Future document ingestion should call `parseDocument` and reconcile extracted structures with controlled engineering records before changing graph state.
