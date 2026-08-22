"""
schema.py — pydantic v2 models: single source of truth for the improved
manufacturable-product dataset.

Structure follows the reference pipeline's canonical 8-section record
(project / requirements / components / relationships / fabrication /
instructions / sourcing / validation, all snake_case) and improves on it:

  + circuit                 pin-level netlist, power budget, protection,
                            breadboard prototype, thermal — a buildable circuit,
                            not wiring buried in note strings.
  + image_generation_prompt structured prompt to render the product.
  + appearance              structured "what it looks like" (dims/finish/features).
  + richer instructions     real expected_result + detail (tools, fasteners w/
                            torque, warnings, qc_check, est_time, process).
  + populated fabrication   tolerances / post_processing actually filled.

Controlled vocabularies match the reference validator so records stay
compatible. Run `python schema.py` to export dataset/schema.json (JSON Schema
draft 2020-12).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- #
# Controlled vocabularies (kept in sync with the reference validator)
# --------------------------------------------------------------------------- #
ComponentType = Literal[
    "3d_printed", "machined", "laser_cut", "electronic",
    "fastener", "mechanical", "consumable", "misc",
]
ComponentCategory = Literal[
    "mechanical", "electrical", "structural", "control",
    "interface", "power", "mounting", "safety",
]
RelationType = Literal[
    "attached_to", "secured_by", "fastens_into", "rotates_on",
    "supported_by", "routed_around", "connects_to", "mounted_on",
    "contains", "positions",
]
InstructionPhase = Literal["fabrication", "wiring", "bring_up", "assembly", "testing"]
SkillLevel = Literal["beginner", "intermediate", "advanced", "unknown"]
VariantType = Literal["seed", "prompt_rewrite", "positive_variant", "evaluation_negative"]
NetKind = Literal["power", "ground", "signal", "bus", "analog", "differential"]

PHASE_ORDER: tuple[str, ...] = ("fabrication", "wiring", "bring_up", "assembly", "testing")
MANUFACTURING_PHASES = frozenset({"fabrication", "bring_up", "testing"})
ASSEMBLY_PHASES = frozenset({"wiring", "assembly"})


# --------------------------------------------------------------------------- #
# project / requirements
# --------------------------------------------------------------------------- #
class Project(_Base):
    project_id: str = Field(pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=2)
    category: str
    summary: str
    original_prompt: str
    revision: str = "A"
    variant_type: VariantType = "seed"
    seed_project_id: str = Field(pattern=r"^[a-z0-9_]+$")
    keywords: list[str] = Field(default_factory=list)


class Requirements(_Base):
    tools: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    skill_level: SkillLevel = "intermediate"
    safety_notes: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# components
# --------------------------------------------------------------------------- #
class Dimensions(_Base):
    raw: Optional[str] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    diameter_mm: Optional[float] = None
    thread: Optional[str] = None


class PrintSettings(_Base):
    raw: Optional[str] = None
    material: Optional[str] = None
    infill_pct: Optional[int] = None
    layer_mm: Optional[float] = None
    perimeters: Optional[int] = None
    nozzle_mm: Optional[float] = None


class Component(_Base):
    component_id: str = Field(pattern=r"^[a-z0-9_]+$")
    display_name: str = Field(min_length=1)
    category: ComponentCategory
    type: ComponentType
    material: str
    quantity: int = Field(ge=1)
    description: str
    dimensions: Dimensions
    functional_role: str
    pins: Optional[list[str]] = None            # electrical parts
    print_settings: Optional[PrintSettings] = None  # 3d_printed parts
    fabrication_ref: Optional[str] = None
    sourcing_ref: Optional[str] = None


# --------------------------------------------------------------------------- #
# relationships (mechanical + high-level; electrical detail lives in circuit)
# --------------------------------------------------------------------------- #
class Relationship(_Base):
    source: str = Field(pattern=r"^[a-z0-9_]+$")
    relation: RelationType
    target: str = Field(pattern=r"^[a-z0-9_]+$")
    required: bool = True
    notes: str = ""


# --------------------------------------------------------------------------- #
# circuit — the electrical prototype (netlist / power / protection / breadboard)
# --------------------------------------------------------------------------- #
class NetMember(_Base):
    component: str = Field(pattern=r"^[a-z0-9_]+$")
    pin: str


class Net(_Base):
    net_id: str = Field(pattern=r"^[a-z0-9_]+$")
    name: str
    kind: NetKind
    voltage: Optional[str] = None
    members: list[NetMember] = Field(min_length=2)


class PowerRail(_Base):
    name: str
    voltage: str
    estimated_current_a: Optional[float] = None
    loads: list[str] = Field(default_factory=list)


class PowerBudget(_Base):
    input_source: str = ""
    rails: list[PowerRail] = Field(default_factory=list)
    total_power_w: Optional[float] = None
    notes: str = ""


class Protection(_Base):
    fusing: Optional[str] = None
    esd: Optional[str] = None
    reverse_polarity: Optional[str] = None
    other: Optional[str] = None


class ProtoStep(_Base):
    step_id: str = Field(pattern=r"^[a-z0-9_]+$")
    instruction: str
    nets: list[str] = Field(default_factory=list)


class CircuitPrototype(_Base):
    method: str = ""
    steps: list[ProtoStep] = Field(default_factory=list)
    bring_up_checks: list[str] = Field(default_factory=list)
    notes: str = ""


class Thermal(_Base):
    hotspots: list[str] = Field(default_factory=list)
    mitigation: str = ""
    notes: str = ""


class Circuit(_Base):
    summary: str = ""
    nets: list[Net] = Field(default_factory=list)
    power_budget: PowerBudget = Field(default_factory=PowerBudget)
    protection: Protection = Field(default_factory=Protection)
    prototype: CircuitPrototype = Field(default_factory=CircuitPrototype)
    thermal: Thermal = Field(default_factory=Thermal)


# --------------------------------------------------------------------------- #
# fabrication
# --------------------------------------------------------------------------- #
class Fabrication(_Base):
    processes: list[str] = Field(default_factory=list)
    component_settings: dict[str, PrintSettings] = Field(default_factory=dict)
    post_processing: list[str] = Field(default_factory=list)
    tolerances: dict[str, str] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# instructions
# --------------------------------------------------------------------------- #
class Fastener(_Base):
    part: str          # component_id or descriptive fastener
    torque: str        # e.g. "0.6 N·m", "hand-tight"


class StepDetail(_Base):
    summary: str
    steps: list[str] = Field(min_length=1)
    tip: Optional[str] = None
    tools: list[str] = Field(default_factory=list)
    fasteners: list[Fastener] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    est_time_min: Optional[float] = None
    # manufacturing (fabrication / bring_up / testing) fields
    process: Optional[str] = None
    machine: Optional[str] = None
    tolerance: Optional[str] = None
    cycle_time_sec: Optional[float] = None
    qc_check: Optional[str] = None


class Instruction(_Base):
    step_id: str = Field(pattern=r"^[a-z0-9_]+$")
    phase: InstructionPhase
    title: str = Field(min_length=1)
    component_ids: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    expected_result: str
    detail: StepDetail


# --------------------------------------------------------------------------- #
# appearance / image prompt
# --------------------------------------------------------------------------- #
class Appearance(_Base):
    overall_dimensions: str
    geometry_summary: str
    finish: str
    color: str
    key_features: list[str] = Field(default_factory=list)
    visual_description: str


class ImageGenerationPrompt(_Base):
    prompt: str
    negative_prompt: str = ""
    tags: list[str] = Field(default_factory=list)
    style: str = ""
    view: str = ""
    lighting: str = ""
    background: str = ""
    aspect_ratio: str = ""


# --------------------------------------------------------------------------- #
# sourcing / validation
# --------------------------------------------------------------------------- #
class SourcingItem(_Base):
    component_id: str
    product_name: str
    unit_cost_usd: float = Field(ge=0)
    quantity: int = Field(ge=1)
    total_cost_usd: float = Field(ge=0)
    vendor: Optional[str] = None
    url: Optional[str] = None


class CostSummary(_Base):
    total_usd: float = Field(ge=0)
    components_priced: int = Field(ge=0)
    components_total: int = Field(ge=0)


class Sourcing(_Base):
    items: list[SourcingItem] = Field(default_factory=list)
    cost_summary: CostSummary
    vendors: list[str] = Field(default_factory=list)


class Issue(_Base):
    severity: Literal["error", "warn"]
    code: str
    message: str
    refs: list[str] = Field(default_factory=list)


class Validation(_Base):
    schema_valid: bool = True
    reference_integrity_valid: bool = True
    manufacturability_valid: bool = True
    naming_consistency_valid: bool = True
    issues: list[Issue] = Field(default_factory=list)
    confidence_score: float = Field(ge=0, le=1, default=1.0)


# --------------------------------------------------------------------------- #
# Root record
# --------------------------------------------------------------------------- #
class Product(_Base):
    project: Project
    requirements: Requirements
    components: list[Component] = Field(min_length=1)
    relationships: list[Relationship] = Field(default_factory=list)
    circuit: Circuit
    fabrication: Fabrication
    instructions: list[Instruction] = Field(default_factory=list)
    appearance: Appearance
    image_generation_prompt: ImageGenerationPrompt
    sourcing: Sourcing
    validation: Validation


# --------------------------------------------------------------------------- #
# JSON Schema export
# --------------------------------------------------------------------------- #
def export_json_schema() -> dict:
    """Return the canonical Product schema as JSON Schema draft 2020-12."""
    schema = Product.model_json_schema(ref_template="#/$defs/{model}")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["title"] = "Product"
    return schema


if __name__ == "__main__":
    out = Path(__file__).parent / "dataset" / "schema.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(export_json_schema(), indent=2), encoding="utf-8")
    print(f"Wrote {out}")

