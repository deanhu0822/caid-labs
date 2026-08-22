# Canonical Product pipeline

`schema.py`, `structured_gen.py`, and `validate.py` are the teammate-provided Product pipeline and are kept unchanged. Forma-specific integration lives in `forma_bridge.py`.

## Responsibilities

- `schema.py`: canonical Pydantic `Product` model and JSON Schema export.
- `structured_gen.py`: reusable constrained-generation ladder for compatible model endpoints.
- `validate.py`: semantic gates and dataset validation.
- `forma_bridge.py`: deterministic rover Rev C/Rev D candidates, validation-before-write, and the frontend validation manifest.
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

The UI will not accept a Product candidate whose manifest entry is missing, whose revision does not match, whose schema or semantic gates did not pass, or whose gate-failure list is non-empty.
