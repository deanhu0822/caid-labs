# Forma inference boundary

Forma Labs uses one `FormaInferenceProvider` interface for assisted reasoning, physical-media observation, and future document parsing. The product graph, reducer state, validation rules, and committed feature JSON remain authoritative; model output is advisory.

Current builds use `MockFormaInferenceProvider`. Its results are deterministic and always report `mode: "mock"` with `inferencePerformed: false`. The UI must not describe these results as real AI inference.

`NvidiaLocalInferenceProvider` is the GB10 integration boundary:

| Capability | Intended model | Environment variable |
| --- | --- | --- |
| Engineering reasoning and orchestration | Llama-3.1-Nemotron-70B-Instruct | `FORMA_REASONING_URL` |
| Image, video, and physical-state observation | Cosmos-Reason1-7B | `FORMA_VISION_URL` |
| Engineering document extraction | `nvidia/NVIDIA-Nemotron-Parse-2.0` | `FORMA_PARSE_URL` |

Endpoints are server-side configuration. Do not place model URLs or model-selection controls in the browser UI. Missing endpoints fall back to the mock provider and are reported explicitly by `GET /api/inference/status`. No model is downloaded or initialized by the application.

Integration paths:

- Guided new-build text, media, and document interpretation use the provider contract. Document uploads call `FormaInferenceProvider.parseDocument`; UI components never select a model or endpoint.
- Agent chat passes its corpus-grounded result through the reasoning boundary; artifact IDs, evidence, matched tasks, and graph mode remain protected source fields.
- Scanner uploads pass through `observeMedia`; the current mock only uses filename-label fixtures or user confirmation.
- Document files remain browser-local for preview. The current deterministic adapter calls `parseDocument`, records per-fact source IDs and filenames, and creates document artifacts in the shared graph state.
- Parse 2.0 is represented only as the future document-parser role. It is not used for engineering reasoning or physical-media observation, and the current mock performs no model inference.
