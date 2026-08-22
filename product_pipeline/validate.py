"""
validate.py — completeness + integrity gates for the improved dataset.

Loads dataset/products/*.json, validates each against schema.py, then runs
semantic gates that go beyond structure: buildable pin-level circuit, zero
orphan references, grounded appearance/image-prompt, real manufacturing and
assembly step bodies. Failing records are quarantined to dataset/rejected/.

Usage:
    python validate.py                 # all products, quarantine failures
    python validate.py a.json b.json   # specific files
    python validate.py --no-quarantine

Exit 0 only if every checked record passes every gate.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

from schema import ASSEMBLY_PHASES, MANUFACTURING_PHASES, PHASE_ORDER, Product

ROOT = Path(__file__).parent
PRODUCTS_DIR = ROOT / "dataset" / "products"
REJECTED_DIR = ROOT / "dataset" / "rejected"

Fail = tuple[str, str]


def _f(gate: str, msg: str) -> Fail:
    return (gate, msg)


def run_gates(p: Product) -> list[Fail]:
    """Return semantic gate failures for an already schema-valid product."""
    fails: list[Fail] = []
    comp_ids = {c.component_id for c in p.components}
    comp_by_id = {c.component_id: c for c in p.components}

    # unique component ids
    if len(comp_ids) != len(p.components):
        dupes = [i for i, n in Counter(c.component_id for c in p.components).items() if n > 1]
        fails.append(_f("bom.dup_id", f"duplicate component ids: {dupes}"))

    # ---- reference integrity (no orphan refs anywhere) -------------------- #
    for r in p.relationships:
        for end in (r.source, r.target):
            if end not in comp_ids:
                fails.append(_f("rel.orphan", f"relationship references missing '{end}'"))
    for it in p.sourcing.items:
        if it.component_id not in comp_ids:
            fails.append(_f("sourcing.orphan", f"sourcing item references missing '{it.component_id}'"))
    for cid in p.fabrication.component_settings:
        if cid not in comp_ids:
            fails.append(_f("fab.orphan", f"fabrication settings for missing '{cid}'"))

    # ---- circuit: buildable, pin-checked netlist -------------------------- #
    elec_ids = {c.component_id for c in p.components if c.category == "electrical"}
    net_ids: set[str] = set()
    on_net: set[str] = set()
    for net in p.circuit.nets:
        if net.net_id in net_ids:
            fails.append(_f("circuit.dup_net", f"duplicate net_id '{net.net_id}'"))
        net_ids.add(net.net_id)
        for m in net.members:
            on_net.add(m.component)
            c = comp_by_id.get(m.component)
            if c is None:
                fails.append(_f("circuit.orphan", f"net '{net.net_id}' references missing '{m.component}'"))
                continue
            if c.pins is not None and m.pin not in c.pins:
                fails.append(_f("circuit.bad_pin",
                                f"net '{net.net_id}' pin '{m.pin}' not declared on '{m.component}'"))
    for cid in elec_ids:
        if cid not in on_net:
            fails.append(_f("circuit.off_net", f"electrical component '{cid}' is on no net"))
    for rail in p.circuit.power_budget.rails:
        for load in rail.loads:
            if load not in comp_ids:
                fails.append(_f("circuit.bad_load", f"rail '{rail.name}' load '{load}' not in BOM"))
    if elec_ids and not p.circuit.power_budget.input_source.strip():
        fails.append(_f("circuit.no_input", "power budget has no input_source"))
    prot = p.circuit.protection
    if elec_ids and not any(v and v.strip() for v in
                            (prot.fusing, prot.esd, prot.reverse_polarity, prot.other)):
        fails.append(_f("circuit.no_protection", "protection lists no measures"))
    proto = p.circuit.prototype
    if elec_ids:
        if not proto.steps:
            fails.append(_f("circuit.no_proto", "prototype has no steps"))
        expected = [f"proto_{i}" for i in range(1, len(proto.steps) + 1)]
        if [s.step_id for s in proto.steps] != expected:
            fails.append(_f("circuit.proto_seq", f"prototype step ids != {expected}"))
        for s in proto.steps:
            for ref in s.nets:
                if ref not in net_ids:
                    fails.append(_f("circuit.proto_net", f"proto '{s.step_id}' bad net '{ref}'"))
        if not proto.bring_up_checks:
            fails.append(_f("circuit.no_checks", "prototype has no bring_up_checks"))

    # ---- instructions: phases ordered, deps backward, real bodies --------- #
    seen_steps: set[str] = set()
    order_index = {ph: i for i, ph in enumerate(PHASE_ORDER)}
    last_phase_rank = -1
    seen_before: set[str] = set()
    for step in p.instructions:
        if step.step_id in seen_steps:
            fails.append(_f("step.dup_id", f"duplicate step_id '{step.step_id}'"))
        seen_steps.add(step.step_id)
        for cid in step.component_ids:
            if cid not in comp_ids:
                fails.append(_f("step.orphan", f"step '{step.step_id}' uses missing '{cid}'"))
        for dep in step.dependencies:
            if dep not in seen_before:
                fails.append(_f("step.fwd_dep", f"step '{step.step_id}' deps on non-prior '{dep}'"))
        seen_before.add(step.step_id)
        rank = order_index[step.phase]
        if rank < last_phase_rank:
            fails.append(_f("step.phase_order", f"phase '{step.phase}' out of canonical order"))
        last_phase_rank = max(last_phase_rank, rank)

        d = step.detail
        if step.phase in MANUFACTURING_PHASES:
            if not (d.process or d.machine or d.qc_check):
                fails.append(_f("mfg.thin", f"manufacturing step '{step.step_id}' lacks process/machine/qc_check"))
        if step.phase in ASSEMBLY_PHASES:
            text = f"{step.title} {' '.join(d.steps)}".lower()
            if any(w in text for w in ("screw", "bolt", "fasten", "torque", "nut")) and not (d.tools or d.fasteners):
                fails.append(_f("asm.no_tool", f"step '{step.step_id}' implies fastening but lists no tools/fasteners"))

    # ---- appearance grounded --------------------------------------------- #
    a = p.appearance
    if len(a.visual_description) < 80:
        fails.append(_f("appearance.thin", "visual_description too short"))
    if not a.key_features:
        fails.append(_f("appearance.no_features", "no key_features"))
    words = {w.lower() for c in p.components for w in c.display_name.split() if len(w) > 3}
    text = a.visual_description.lower()
    if not (any(w in text for w in words) or any(ch.isdigit() for ch in a.overall_dimensions)):
        fails.append(_f("appearance.ungrounded", "appearance not grounded in parts/dimensions"))

    # ---- image generation prompt ----------------------------------------- #
    ip = p.image_generation_prompt
    if len(ip.prompt) < 120:
        fails.append(_f("image.thin", "image prompt too short (<120 chars)"))
    else:
        pt = ip.prompt.lower()
        name_words = {w.lower() for w in p.project.name.split() if len(w) > 3}
        if not (any(w in pt for w in words) or any(w in pt for w in name_words)):
            fails.append(_f("image.ungrounded", "image prompt names no real part/product"))

    # ---- sourcing totals consistent -------------------------------------- #
    calc_total = round(sum(it.total_cost_usd for it in p.sourcing.items), 2)
    if abs(calc_total - p.sourcing.cost_summary.total_usd) > 0.02:
        fails.append(_f("sourcing.total", f"cost_summary.total_usd {p.sourcing.cost_summary.total_usd} != sum {calc_total}"))
    for it in p.sourcing.items:
        if abs(round(it.unit_cost_usd * it.quantity, 2) - it.total_cost_usd) > 0.02:
            fails.append(_f("sourcing.line", f"item '{it.component_id}' total != unit*qty"))

    # ---- validation block must not over-claim ---------------------------- #
    if fails and (p.validation.confidence_score >= 1.0 or p.validation.reference_integrity_valid):
        fails.append(_f("validation.overclaim", "validation block claims clean but gates failed"))

    return fails


def run_warnings(p: Product) -> list[str]:
    """Report unused components without rejecting an otherwise valid product."""
    warns: list[str] = []
    used = {cid for s in p.instructions for cid in s.component_ids}
    used |= {e for r in p.relationships for e in (r.source, r.target)}
    used |= {m.component for n in p.circuit.nets for m in n.members}
    for c in p.components:
        if c.component_id not in used:
            warns.append(f"component '{c.component_id}' ({c.display_name}) never used")
    return warns


def validate_file(path: Path) -> tuple[str, list[Fail], list[str]]:
    """Validate one JSON file and return its id, failures, and warnings."""
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    try:
        p = Product.model_validate(raw)
    except ValidationError as e:
        pid = (raw.get("project") or {}).get("project_id", path.stem)
        return (pid, [("schema.invalid", str(e))], [])
    return (p.project.project_id, run_gates(p), run_warnings(p))


def main() -> int:
    """Run validation for explicit paths or every record in dataset/products."""
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--no-quarantine", action="store_true")
    args = ap.parse_args()

    files = [Path(x) for x in args.paths] if args.paths else sorted(PRODUCTS_DIR.glob("*.json"))
    if not files:
        print("No product files found.")
        return 0

    accepted = rejected = warn_total = 0
    gate_counter: Counter[str] = Counter()
    for f in files:
        pid, fails, warns = validate_file(f)
        warn_total += len(warns)
        if fails:
            rejected += 1
            for g, _ in fails:
                gate_counter[g] += 1
            print(f"[FAIL] {f.name} ({pid}) — {len(fails)} gate failure(s):")
            for g, m in fails:
                print(f"        - {g}: {m}")
            if not args.no_quarantine and f.parent.name == "products":
                REJECTED_DIR.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, REJECTED_DIR / f.name)
                print(f"        -> quarantined to {REJECTED_DIR / f.name}")
        else:
            accepted += 1
            if warns:
                print(f"[ok]   {f.name} ({pid}) — {len(warns)} warning(s)")
                for w in warns:
                    print(f"        ~ {w}")

    print("\n" + "=" * 60)
    print(f"Accepted: {accepted}   Rejected: {rejected}   Warnings: {warn_total}")
    if gate_counter:
        print("Gate-failure breakdown:")
        for g, n in gate_counter.most_common():
            print(f"  {n:>3}  {g}")
    print("=" * 60)
    return 0 if rejected == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

