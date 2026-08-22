# Engineering test corpus

The teammate corpus is preserved byte-for-byte under `public/engineering-test-assets/`. The source folder is not modified. Every copied file was checked against its original SHA-256.

## Inventory and routing

| Asset | Source category | Files | Detected modality | Pipeline | Prototype focus |
| --- | --- | --- | --- | --- | --- |
| Machined bracket | Mechanical drawing | 1-page PDF, 1 PNG page render, golden JSON | Document | Nemotron Parse 2.0 | Dimensions, tolerances, material, part identity |
| Molded housing | Molded-part drawing | 1-page PDF, 1 PNG page render, golden JSON | Document | Nemotron Parse 2.0 | Thin wall, thick boss, sharp corner, missing draft |
| Sheet-metal bracket | Flat-pattern drawing | 1-page PDF, 1 PNG page render, golden JSON | Document | Nemotron Parse 2.0 | Bend radius and hole clearances |
| Defective shaft | Defective drawing | 1-page PDF, 1 PNG page render, golden JSON | Document | Nemotron Parse 2.0 | Blank material, untoleranced bore, mixed units |
| Connector datasheet | Component datasheet | 1-page PDF, golden JSON | Document | Nemotron Parse 2.0 | Tables and a buried current-derating note |
| Pump assembly | Assembly drawing and BOM | 2-page PDF, 2 PNG page renders, golden JSON | Document | Nemotron Parse 2.0 | Multi-page coverage and a page-2 six-item BOM |
| README | Corpus documentation | Markdown | None | None | Test instructions and expected assertions |

The folder contains no normal hardware photographs and no videos. Its PNGs are derived technical-document pages, so they stay on the Document path rather than the Cosmos physical-media path.

## Fixture contract

The six `*.golden.json` files share a small extraction-evaluation contract:

- `parts`: name, quantity, material, confidence
- `dimensions`: label, textual value, unit, confidence
- `risks`: title, severity, rationale, mitigation, confidence
- `tasks`: title and source

This is neither `schema.py::Product` nor a Forma feature JSON record. The in-app harness validates the extraction fixture shape separately and blocks Product commit. A future adapter must map a reviewed extraction into a complete Product candidate and pass `validate.py` before it can enter shared state.

## Harness behavior

Open **Test Assets** in the Forma header. Selecting and running an asset:

1. retains the source filename and SHA-256 provenance;
2. routes the PDF to the Document / Parse 2.0 role;
3. uses a configured local parser if available;
4. otherwise loads the matching golden file as a visible **Prototype fixture** with `inferencePerformed: false`;
5. validates and previews the structured JSON;
6. leaves rover-alpha and the shared Product graph unchanged.

The disabled commit control documents the required Product mapping and Python validation boundary. It is intentionally not a shortcut around that boundary.
