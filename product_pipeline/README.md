# Canonical Product pipeline

`schema.py`, `structured_gen.py`, and `validate.py` are the teammate-provided Product pipeline and are kept unchanged. Forma-specific integration lives in `forma_bridge.py` and the server-only `nvidia_build_bridge.py`.

## Responsibilities

- `schema.py`: canonical Pydantic `Product` model and JSON Schema export.
- `structured_gen.py`: reusable constrained-generation ladder for compatible model endpoints.
- `validate.py`: semantic gates and dataset validation.
- `forma_bridge.py`: deterministic rover Rev C/Rev D candidates, validation-before-write, and the frontend validation manifest.
- `nvidia_build_bridge.py`: NVIDIA Build model discovery, health probing, and agent reasoning through the existing structured-generation/validation ladder.
- `dataset/products/*.json`: accepted canonical Product records consumed by the UI adapter.
- `dataset/validation_manifest.json`: hashes and authoritative validation outcomes for those records.

Feature JSON under `synthetic-assets/rover-alpha/features` remains workflow input/evidence. It does not override the Product.

## Verification

From `product_pipeline` with Pydantic v2 available:

```powershell
python structured_gen.py --selftest
python schema.py
python forma_bridge.py selftest
python validate.py --no-quarantine
```

For NVIDIA Build support, install `requirements-inference.txt`, keep `NVIDIA_API_KEY` server-side, and select `FORMA_INFERENCE_PROVIDER=nvidia-build`. Use `/api/inference/status?probe=1` to verify a real validated response before treating the provider as connected.

The UI will not accept a Product candidate whose manifest entry is missing, whose revision does not match, whose schema or semantic gates did not pass, or whose gate-failure list is non-empty.
