# Autonomous Inspection Rover — synthetic engineering corpus

**Product:** Autonomous Inspection Rover  
**Product ID:** `rover-alpha`  
**Current revision:** Rev C (DVT)  
**Data status:** 100% synthetic demo content

This corpus is the coherent engineering back-end for the existing Forma graph. It contains 34 graph artifacts and the original 40 relationships, plus machine-readable mechanical/electrical data, valid small firmware fixtures, a 30-line BOM, specifications, manufacturing instructions, supplier records, quantitative tests, revisions, scanner examples, agent evaluation ground truth, and a local MongoDB loader.

No production CAD, proprietary drawings, real purchasing agreements, credentials, or confidential data are included. Real manufacturer names and the Molex identifier `43025-0400` are retained only where already present in the Forma demo; all commercial records and unrecognized part numbers are synthetic.

## Directory guide

| Directory | Contents |
|---|---|
| `mechanical/` | JSON part metadata, three simple OpenSCAD reference models, envelope SVG |
| `electrical/` | Board metadata, J12 pin map, reasoning netlist |
| `firmware/` | Small C/Rust fixtures tied to Rev C hardware symbols |
| `bom/` | Canonical BOM data, CSV, and formatted XLSX |
| `specs/` | Payload, power/runtime, camera, environment requirements |
| `manufacturing/` | ROUTE-08, WI-114, WI-082, QA-FIX-C, structured build order |
| `suppliers/` | Synthetic availability, costs, MOQ, and alternates |
| `tests/` | Procedures and sample results for all graph test nodes |
| `revisions/` | Rev A/B/C records and human-readable change log |
| `scanner/` | Synthetic SVG/PNG inputs and bounding-box labels |
| `evaluation/` | Builder, Product, and Supply agent questions with expected answers |
| `mongodb/` | Local loader and collection/index design |
| `tools/` | Corpus validator |

## Canonical cross-domain anchor: J12

Rev C J12 is the Molex `43025-0400`, a four-circuit connector. Pin 1 is `VMOTOR_24V`, pin 2 is `MOTOR_RETURN`, pin 3 is `MOTOR_PWR_EN`/`GPIO_17`, and pin 4 is `MOTOR_PWR_SENSE`/`ADC3`. The same mapping appears in the BOM, electrical data, firmware, WI-114, supplier records, tests, revisions, and evaluation tasks.

## Validation

From this directory run:

`node tools/validate-dataset.mjs`

The validator parses JSON/CSV, checks graph and explicit artifact references, verifies BOM line mappings and J12 cross-domain consistency, validates scanner boxes, checks evaluation coverage, and scans for common secret patterns.

## Ten example agent questions

1. What systems are affected if J12 changes?
2. J12 has no unrestricted inventory; what alternate is available and why is it not a drop-in?
3. Increase payload capacity from 8.0 kg to 10.4 kg using available parts—what must change?
4. Why does MTR-24-290 require more than a BOM substitution?
5. Can rover-alpha reach four hours of runtime with BAT-24-18, and what mechanical tradeoff appears?
6. Which current component creates the greatest supplier-shortage risk?
7. Why is HAR-J12-B incompatible with MCB-C4?
8. What evidence supports the current 8 kg payload rating?
9. If CM-4K-R2 is replaced by ALT-CAM-4K-L, which firmware, test, mount, and power artifacts change?
10. Which manufacturing and QA steps must be revised for the NSI-MF4-LK connector alternate?

## MongoDB

See `mongodb/README.md`. The loader targets a local MongoDB instance by default and creates artifact, document, relationship, revision, and evaluation collections with retrieval-oriented indexes.
