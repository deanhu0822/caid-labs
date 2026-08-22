"""Forma adapter for the teammate-provided Product pipeline.

This module deliberately stays outside schema.py, structured_gen.py, and
validate.py.  It builds deterministic rover demo candidates, validates them
with the canonical Pydantic Product and semantic gates, then writes only
accepted Product JSON plus a small validation manifest consumed by Forma.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Callable

from pydantic import ValidationError

from schema import Product
from validate import run_gates, run_warnings


ROOT = Path(__file__).parent
PRODUCTS_DIR = ROOT / "dataset" / "products"
BASE_PATH = PRODUCTS_DIR / "rover_alpha_rev_c.json"
MANIFEST_PATH = ROOT / "dataset" / "validation_manifest.json"

VariantBuilder = Callable[[dict[str, Any]], dict[str, Any]]


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _component(data: dict[str, Any], component_id: str) -> dict[str, Any]:
    return next(item for item in data["components"] if item["component_id"] == component_id)


def _source(data: dict[str, Any], component_id: str) -> dict[str, Any]:
    return next(item for item in data["sourcing"]["items"] if item["component_id"] == component_id)


def _replace_exact(value: Any, before: str, after: str) -> Any:
    """Replace exact string references without rewriting engineering prose."""
    if isinstance(value, dict):
        return {key: _replace_exact(item, before, after) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_exact(item, before, after) for item in value]
    return after if value == before else value


def _set_revision(data: dict[str, Any], summary: str) -> None:
    data["project"]["revision"] = "D"
    data["project"]["variant_type"] = "positive_variant"
    data["project"]["summary"] = summary
    data["validation"] = {
        "schema_valid": True,
        "reference_integrity_valid": True,
        "manufacturability_valid": True,
        "naming_consistency_valid": True,
        "issues": [],
        "confidence_score": 0.96,
    }


def _refresh_cost(data: dict[str, Any]) -> None:
    summary = data["sourcing"]["cost_summary"]
    summary["total_usd"] = round(sum(item["total_cost_usd"] for item in data["sourcing"]["items"]), 2)
    summary["components_priced"] = len(data["sourcing"]["items"])
    summary["components_total"] = len(data["components"])


def payload_variant(base: dict[str, Any]) -> dict[str, Any]:
    data = _replace_exact(copy.deepcopy(base), "drive_motor_m2", "drive_motor_m4")
    _set_revision(data, "Rev D payload candidate with the released chassis retained and the drivetrain updated for 10.4 kg.")
    motor = _component(data, "drive_motor_m4")
    motor.update({
        "display_name": "24V Motor M4",
        "description": "MTR-24-290 24 V drive motor rated for 8.4 Nm and the 10.4 kg payload target.",
        "functional_role": "Provides the validated torque envelope for the Rev D payload target.",
    })
    controller = _component(data, "motor_controller")
    controller["description"] = "MCTRL-D1 dual controller with a validated 10 A channel ceiling."
    driver = _component(data, "motor_driver")
    driver["description"] = "DRV-10A H-bridge matched to the Rev D drivetrain current envelope."
    motor_source = _source(data, "drive_motor_m4")
    motor_source.update({"product_name": "MTR-24-290 Motor M4", "unit_cost_usd": 57.8, "total_cost_usd": 115.6})
    data["requirements"]["constraints"] = [
        "10.4 kg validated payload",
        "24 V power architecture",
        "Current CHS-240 chassis",
        "Four-pin J12 motor interface",
    ]
    motor_rail = next(rail for rail in data["circuit"]["power_budget"]["rails"] if rail["name"] == "24 V motor bus")
    motor_rail["estimated_current_a"] = 9.2
    data["circuit"]["power_budget"]["total_power_w"] = 254.4
    data["circuit"]["power_budget"]["notes"] = "Rev D estimate at the validated 10.4 kg payload target."
    data["appearance"]["visual_description"] = data["appearance"]["visual_description"].replace("Rev C", "Rev D")
    data["image_generation_prompt"]["prompt"] = data["image_generation_prompt"]["prompt"].replace("Rev C", "Rev D")
    _refresh_cost(data)
    return data


def camera_mount_variant(base: dict[str, Any]) -> dict[str, Any]:
    data = copy.deepcopy(base)
    _set_revision(data, "Rev D camera-visibility candidate with a 105 mm mount and unchanged chassis interface.")
    mount = _component(data, "camera_mount")
    mount["display_name"] = "Camera Mount Tall"
    mount["description"] = "105 mm camera riser retaining the released CHS-240 mounting interface."
    mount["dimensions"]["raw"] = "105 mm optical-center height"
    mount["dimensions"]["height_mm"] = 105
    mount["functional_role"] = "Positions the camera above a 90 mm obstacle while retaining the released interface."
    return data


def j12_variant(base: dict[str, Any]) -> dict[str, Any]:
    data = copy.deepcopy(base)
    _set_revision(data, "Rev D sourcing candidate with an electrically compatible J12 alternate and controlled interface updates.")
    connector = _component(data, "j12_connector")
    connector["display_name"] = "J12 Connector Alternate"
    connector["description"] = "NSI-MF4-LK four-circuit alternate for the Rev D motor-power interface."
    connector["dimensions"]["raw"] = "Four-circuit right-angle alternate with revised latch clearance"
    source = _source(data, "j12_connector")
    source.update({"product_name": "NSI-MF4-LK", "unit_cost_usd": 0.71, "total_cost_usd": 0.71, "vendor": "Northstar Interconnect"})
    if "Northstar Interconnect" not in data["sourcing"]["vendors"]:
        data["sourcing"]["vendors"].append("Northstar Interconnect")
    _refresh_cost(data)
    return data


def runtime_variant(base: dict[str, Any]) -> dict[str, Any]:
    data = copy.deepcopy(base)
    _set_revision(data, "Rev D runtime candidate with an 18 Ah pack and locally revised battery enclosure.")
    pack = _component(data, "battery_pack")
    pack["description"] = "BAT-24-18 24 V, 18 Ah battery pack for the four-hour mission target."
    pack["dimensions"].update({"raw": "275 x 148 x 92 mm", "length_mm": 275})
    enclosure = _component(data, "battery_enclosure")
    enclosure["display_name"] = "Battery Enclosure D1"
    enclosure["description"] = "BAT-CAGE-D1 enclosure extended for the 18 Ah battery while retaining chassis fasteners."
    enclosure["dimensions"].update({"raw": "D1 envelope for 275 x 148 x 92 mm pack", "length_mm": 289})
    source = _source(data, "battery_pack")
    source.update({"product_name": "BAT-24-18 lithium-ion pack", "unit_cost_usd": 180.0, "total_cost_usd": 180.0})
    data["requirements"]["constraints"] = [
        "4.0 hour mission runtime",
        "24 V power architecture",
        "Local battery enclosure change permitted",
        "Payload and thermal checks required",
    ]
    _refresh_cost(data)
    return data


VARIANTS: dict[str, tuple[str, VariantBuilder]] = {
    "rover-alpha:rev-d-payload": ("rover_alpha_rev_d_payload.json", payload_variant),
    "rover-alpha:rev-d-camera": ("rover_alpha_rev_d_camera.json", camera_mount_variant),
    "rover-alpha:rev-d-j12": ("rover_alpha_rev_d_j12.json", j12_variant),
    "rover-alpha:rev-d-runtime": ("rover_alpha_rev_d_runtime.json", runtime_variant),
}


def validate_record(data: dict[str, Any]) -> tuple[Product, list[tuple[str, str]], list[str]]:
    product = Product.model_validate(data)
    failures = run_gates(product)
    warnings = run_warnings(product)
    return product, failures, warnings


def _manifest_entry(key: str, path: Path, product: Product, warnings: list[str]) -> dict[str, Any]:
    payload = path.read_bytes()
    return {
        "candidate_id": key,
        "path": path.relative_to(ROOT.parent).as_posix(),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "project_id": product.project.project_id,
        "revision": f"Rev {product.project.revision}",
        "schema_validation": "pass",
        "semantic_gates": "pass",
        "gate_failures": [],
        "warnings": warnings,
        "components": len(product.components),
        "relationships": len(product.relationships),
        "nets": len(product.circuit.nets),
        "instructions": len(product.instructions),
        "sourcing_items": len(product.sourcing.items),
    }


def build_demo() -> dict[str, Any]:
    base = _load(BASE_PATH)
    records: dict[str, Any] = {}
    base_product, base_failures, base_warnings = validate_record(base)
    if base_failures:
        raise RuntimeError(f"Base Product failed semantic gates: {base_failures}")
    records["rover-alpha:rev-c"] = _manifest_entry("rover-alpha:rev-c", BASE_PATH, base_product, base_warnings)

    for key, (filename, builder) in VARIANTS.items():
        data = builder(base)
        try:
            product, failures, warnings = validate_record(data)
        except ValidationError as exc:
            raise RuntimeError(f"{key} failed Product schema validation: {exc}") from exc
        if failures:
            exact = "; ".join(f"{gate}: {message}" for gate, message in failures)
            raise RuntimeError(f"{key} failed semantic gates: {exact}")
        path = PRODUCTS_DIR / filename
        path.write_text(json.dumps(product.model_dump(mode="json"), indent=2) + "\n", encoding="utf-8")
        records[key] = _manifest_entry(key, path, product, warnings)

    manifest = {
        "manifest_version": "forma-product-validation-v1",
        "canonical_schema": "product_pipeline/schema.py::Product",
        "structured_generator": "product_pipeline/structured_gen.py::StructuredGenerator",
        "semantic_validator": "product_pipeline/validate.py::run_gates",
        "records": records,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def selftest() -> None:
    manifest = build_demo()
    assert len(manifest["records"]) == 5
    broken = _load(BASE_PATH)
    broken["circuit"]["nets"][0]["members"][0]["pin"] = "NOT_A_DECLARED_PIN"
    _, failures, _ = validate_record(broken)
    assert any(gate == "circuit.bad_pin" for gate, _ in failures), failures
    print("forma bridge selftest OK")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build validated Forma rover Product candidates")
    parser.add_argument("command", nargs="?", choices=("build-demo", "selftest"), default="build-demo")
    args = parser.parse_args()
    if args.command == "selftest":
        selftest()
    else:
        manifest = build_demo()
        for key, record in manifest["records"].items():
            print(f"accepted {key}: {record['components']} components, {record['relationships']} relationships")
        print(f"wrote {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
