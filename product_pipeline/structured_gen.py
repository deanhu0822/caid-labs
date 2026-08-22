"""
structured_gen.py — schema-constrained generation + per-generation validation.

This is the reusable core of Parti-Agent, lifted out of the two parts that are
specific to *this* dataset: `export_sft.py` (LLaMA-Factory / Unsloth training
export) and `evaluation/orchestrated_blueprint.py` (the parti-vision repair
experiment). Neither is imported here.

What is left is the part that transfers to any project:

    Pydantic model  ->  JSON Schema  ->  constrained decode  ->  parse
                    ->  schema validate  ->  semantic gates
                    ->  retry with the failures fed back  ->  accept or reject

Nothing about hardware blueprints is baked in. Swap `output_model` and `gates`
and the same engine generates invoices, lesson plans, or API test cases. The
Product/`run_gates` wiring at the bottom is one worked example, not the API.

Endpoint: NVIDIA BUILD (https://integrate.api.nvidia.com/v1), which is
OpenAI-compatible, so `--base-url` points it at vLLM, Nebius, Together, or a
local NIM container without code changes.

Usage:
    python structured_gen.py --selftest                    # offline, no API key
    python structured_gen.py --list-models                 # what your key can call
    python structured_gen.py "a USB-C desk lamp"           # one validated record
    python structured_gen.py "a bike tail light" --mode json_schema --attempts 4
    python structured_gen.py "a soil moisture probe" --out runs/soil

Key: NVIDIA_API_KEY in the environment or a gitignored .env beside this file.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Sequence

from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).parent

# --------------------------------------------------------------------------- #
# Endpoint defaults
# --------------------------------------------------------------------------- #
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
# Accept whichever name the key was pasted under.
KEY_ENVS = ("NVIDIA_API_KEY", "NVIDIA_BUILD_API_KEY", "NIM_API_KEY")
# Used when --model is omitted: first live model id containing one of these wins.
# Ordered for dense, schema-faithful JSON. Instruct models before reasoning ones —
# a reasoning model spends the token budget thinking and truncates the record.
MODEL_PREFERENCES = (
    "qwen3-coder",
    "llama-3.3-nemotron-super",
    "llama-3.3-70b-instruct",
    "qwen2.5-coder-32b",
    "mixtral-8x22b",
)
FALLBACK_MODEL = "meta/llama-3.3-70b-instruct"

# Gate failures are (gate_id, message) — the id is what you route, count, and
# regress on; the message is for the human and for the retry prompt.
Fail = tuple[str, str]
Gate = Callable[[Any], Sequence[Fail]]


def load_env_file(path: Path | None = None) -> None:
    """Load KEY=VALUE lines from a local .env into os.environ. Never printed.

    Kept from gen_records.py: one function replaces a python-dotenv dependency,
    and the real environment always wins (setdefault), so CI overrides a stale
    local file instead of losing to it.
    """
    env_path = path or (ROOT / ".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name, value = name.strip(), value.strip().strip('"').strip("'")
        if name and value:
            os.environ.setdefault(name, value)


def api_key() -> str | None:
    for name in KEY_ENVS:
        v = os.environ.get(name)
        if v:
            return v
    return None


# --------------------------------------------------------------------------- #
# Schema shaping for constrained decoding
#
# A Pydantic schema is written for *validation*, where anything unstated is
# simply unconstrained. A grammar engine reads the same document as a licence:
# whatever the schema permits, the sampler may do forever. These three passes
# close the gaps that actually bite. They shape the schema handed to the model
# only — your validation model is untouched, so nothing here can launder a bad
# record past a gate.
# --------------------------------------------------------------------------- #
DEFAULT_MAX_ITEMS = int(os.environ.get("GEN_MAX_ITEMS", "96"))
NUM_PATTERN = r"^-?[0-9]{1,6}(\.[0-9]{1,3})?$"
INT_PATTERN = r"^-?[0-9]{1,6}$"


def _bound_arrays(node: Any, max_items: int) -> None:
    """Give every unbounded array a maxItems, in place.

    An array with no maxItems lets a constrained decode legally append items
    until the token ceiling. Set the cap above the largest array any real record
    contains and it cannot distort output — it only makes runaway impossible.
    """
    if isinstance(node, dict):
        if node.get("type") == "array" and "maxItems" not in node:
            node["maxItems"] = max_items
        for v in node.values():
            _bound_arrays(v, max_items)
    elif isinstance(node, list):
        for v in node:
            _bound_arrays(v, max_items)


def _stringify_numbers(node: Any) -> None:
    """Replace number/integer leaves with pattern-bounded strings, in place.

    Some grammar compilers emit digits without end on a bare `"type": "number"`
    (thousands of them, at any temperature) because JSON puts no bound on a
    numeric literal. A string with a pattern compiles to a finite automaton
    instead, and Pydantic coerces "12.5" back to 12.5 on validate.

    Only needed on backends that show the failure. Off is the better default
    when the backend behaves: `--stringify-numbers` turns it on.
    """
    if isinstance(node, dict):
        t = node.get("type")
        if t in ("number", "integer"):
            node.clear()  # min/max are meaningless once the leaf is a string
            node.update({"type": "string", "pattern": NUM_PATTERN if t == "number" else INT_PATTERN})
            return
        for v in node.values():
            _stringify_numbers(v)
    elif isinstance(node, list):
        for v in node:
            _stringify_numbers(v)


def _require_all_properties(node: Any) -> None:
    """Mark every object's properties as required, in place.

    Optional-in-Pydantic means omittable-in-grammar, and a model asked for ten
    sections will happily return three valid ones. Requiring everything makes
    the shape non-negotiable; a field that is genuinely absent can still be
    `null` if its schema allows it.
    """
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict) and props:
            node["required"] = sorted(props)
        for v in node.values():
            _require_all_properties(v)
    elif isinstance(node, list):
        for v in node:
            _require_all_properties(v)


def prepare_schema(
    output_model: type[BaseModel],
    *,
    only: Sequence[str] | None = None,
    max_items: int = DEFAULT_MAX_ITEMS,
    stringify_numbers: bool = False,
    require_all: bool = True,
) -> dict:
    """Derive a decode-safe JSON Schema from a Pydantic model.

    Always derived from the model, never hand-maintained: a second copy of the
    schema drifts from the validator, and then the model is being constrained to
    something the gates no longer accept.
    """
    schema = deepcopy(output_model.model_json_schema())
    if only:
        props = schema.get("properties", {})
        missing = [n for n in only if n not in props]
        if missing:
            raise KeyError(f"not fields of {output_model.__name__}: {missing}")
        schema["properties"] = {n: props[n] for n in only}
        schema["required"] = list(only)
    if require_all:
        _require_all_properties(schema)
    _bound_arrays(schema, max_items)
    if stringify_numbers:
        _stringify_numbers(schema)
    return schema


# --------------------------------------------------------------------------- #
# Response parsing
# --------------------------------------------------------------------------- #
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def extract_json(text: str) -> tuple[dict | None, str]:
    """Parse a model response into a dict, or return (None, reason).

    Tolerates every wrapper these endpoints actually produce: markdown fences,
    a `<think>` block from a reasoning model, prose before or after the object,
    a second object appended after the first, and raw newlines inside strings
    (strict=False) which strict JSON rejects outright.
    """
    t = _THINK_RE.sub("", text or "").strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t).strip()
    if not t:
        return None, "empty response"
    try:
        obj = json.loads(t, strict=False)
        return (obj, "") if isinstance(obj, dict) else (None, "top-level JSON value is not an object")
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    if start < 0:
        return None, "no JSON object found in response"
    try:  # first complete object, ignoring trailing junk
        obj, _ = json.JSONDecoder(strict=False).raw_decode(t[start:])
    except json.JSONDecodeError as e:
        end = t.rfind("}")
        if end <= start:
            return None, f"JSON parse failed: {e}"
        try:  # outermost braces, for prose wrapped around a good object
            obj = json.loads(t[start : end + 1], strict=False)
        except json.JSONDecodeError as e2:
            return None, f"JSON parse failed: {e2}"
    return (obj, "") if isinstance(obj, dict) else (None, "first JSON value is not an object")


# --------------------------------------------------------------------------- #
# Context arithmetic and transport retry
# --------------------------------------------------------------------------- #
def fit_max_tokens(prompt_chars: int, requested: int, context_window: int, *, reserve: int = 512) -> int:
    """Shrink `requested` so prompt + completion stays inside the window.

    Dense JSON tokenises near 3 chars/token; estimate high rather than low.
    Overshooting the window is not a short answer, it is an opaque 500 — and
    the retry loop then burns its attempts on a failure it cannot read.
    """
    room = context_window - (prompt_chars // 3) - reserve
    return max(512, min(requested, room))


_TRANSIENT = ("500", "502", "503", "504", "429", "timeout", "Timeout", "overloaded", "Connection")


def call_with_retry(client, *, tries: int = 3, backoff: float = 5.0, **kwargs):
    """Retry ONE call on transient transport errors.

    Deliberately the innermost retry. Wrap the whole generation instead and a
    502 mid-repair silently restarts authoring from scratch, so a record comes
    back clean by re-rolling rather than by being fixed — and your accept rate
    measures luck.
    """
    for attempt in range(1, tries + 1):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as e:  # noqa: BLE001 — classify, then re-raise or retry
            if attempt == tries or not any(s in str(e) for s in _TRANSIENT):
                raise
            time.sleep(backoff * attempt)
    raise RuntimeError("retry loop exhausted")


# --------------------------------------------------------------------------- #
# Constraint ladder
#
# "Structured output" is not one feature. Per model, a NIM endpoint may honour
# the OpenAI json_schema response_format, NVIDIA's nvext.guided_json, plain
# json_object, or none of them — and a rejection looks like a 400, not a
# capability flag. So try hardest-first and demote on rejection, recording
# which rung actually carried the generation. Never assume; measure per model.
# --------------------------------------------------------------------------- #
MODES = ("json_schema", "guided_json", "json_object", "free")
_UNSUPPORTED = ("response_format", "guided", "nvext", "not supported", "unsupported",
                "invalid_request", "Invalid value", "json_schema", "400", "422")


def mode_kwargs(mode: str, schema: dict, name: str, *, strict: bool = False) -> dict:
    """Request kwargs that ask this rung of the ladder for constrained output."""
    if mode == "json_schema":
        js: dict[str, Any] = {"name": name, "schema": schema}
        if strict:  # OpenAI honours this; several NIM models 400 on it
            js["strict"] = True
        return {"response_format": {"type": "json_schema", "json_schema": js}}
    if mode == "guided_json":
        return {"extra_body": {"nvext": {"guided_json": schema}}}
    if mode == "json_object":
        return {"response_format": {"type": "json_object"}}
    if mode == "free":
        return {}
    raise ValueError(f"unknown mode: {mode}")


def _looks_unsupported(err: Exception) -> bool:
    s = str(err)
    return any(t in s for t in _UNSUPPORTED)


# --------------------------------------------------------------------------- #
# Result records — one row per attempt, so every generation is auditable
# --------------------------------------------------------------------------- #
@dataclass
class Attempt:
    index: int
    mode: str
    ok: bool
    failures: list[Fail] = field(default_factory=list)
    parse_error: str = ""
    api_error: str = ""
    finish_reason: str = ""
    usage: dict = field(default_factory=dict)
    chars: int = 0

    def summary(self) -> str:
        if self.ok:
            return f"attempt {self.index} [{self.mode}] accepted"
        why = self.api_error or self.parse_error or f"{len(self.failures)} gate failure(s)"
        return f"attempt {self.index} [{self.mode}] rejected: {why}"


@dataclass
class Result:
    ok: bool
    model: str
    data: dict | None = None            # raw parsed JSON of the accepted candidate
    value: BaseModel | None = None      # validated Pydantic object
    attempts: list[Attempt] = field(default_factory=list)
    failures: list[Fail] = field(default_factory=list)   # of the LAST attempt
    mode_used: str = ""
    elapsed_s: float = 0.0

    def report(self) -> dict:
        """Validation report for this generation. Write it next to the output."""
        return {
            "ok": self.ok,
            "model": self.model,
            "mode_used": self.mode_used,
            "attempts": len(self.attempts),
            "elapsed_s": round(self.elapsed_s, 2),
            "final_failures": [{"gate": g, "message": m} for g, m in self.failures],
            "gate_ids": sorted({g for g, _ in self.failures}),
            "trace": [
                {
                    "attempt": a.index,
                    "mode": a.mode,
                    "ok": a.ok,
                    "api_error": a.api_error,
                    "parse_error": a.parse_error,
                    "finish_reason": a.finish_reason,
                    "response_chars": a.chars,
                    "usage": a.usage,
                    "failures": [{"gate": g, "message": m} for g, m in a.failures],
                }
                for a in self.attempts
            ],
        }


# --------------------------------------------------------------------------- #
# The generator
# --------------------------------------------------------------------------- #
class StructuredGenerator:
    """Generate one `output_model` instance, validated before it is returned.

    `gates` are the semantic checks schema validation cannot express — the
    difference between "shaped like a record" and "a correct record". Each gate
    takes the validated object and returns (gate_id, message) failures. They run
    only after schema validation passes, so a gate never has to defend itself
    against a missing field.
    """

    def __init__(
        self,
        *,
        output_model: type[BaseModel],
        model: str,
        client: Any = None,
        base_url: str = NVIDIA_BASE_URL,
        key: str | None = None,
        system_prompt: str = "",
        gates: Sequence[Gate] = (),
        mode: str = "auto",
        attempts: int = 3,
        temperature: float = 0.4,
        max_tokens: int = 16000,
        context_window: int = 128000,
        stringify_numbers: bool = False,
        max_items: int = DEFAULT_MAX_ITEMS,
        require_all: bool = True,
        strict: bool = False,
        only: Sequence[str] | None = None,
        timeout: float = 900.0,
        extra_kwargs: dict | None = None,
    ) -> None:
        self.output_model = output_model
        self.model = model
        self.system_prompt = system_prompt
        self.gates = list(gates)
        self.attempts = max(1, attempts)
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.context_window = context_window
        self.strict = strict
        self.extra_kwargs = dict(extra_kwargs or {})
        self.schema = prepare_schema(
            output_model,
            only=only,
            max_items=max_items,
            stringify_numbers=stringify_numbers,
            require_all=require_all,
        )
        self.schema_name = output_model.__name__
        self._ladder = list(MODES) if mode == "auto" else [mode]
        if client is None:
            from openai import OpenAI  # imported lazily so --selftest needs no openai

            k = key or api_key()
            if not k:
                raise SystemExit(f"No API key found (checked {', '.join(KEY_ENVS)} and .env).")
            client = OpenAI(base_url=base_url, api_key=k, timeout=timeout, max_retries=0)
        self.client = client

    # -- validation ------------------------------------------------------- #
    def validate(self, data: dict) -> tuple[BaseModel | None, list[Fail]]:
        """Schema-validate then gate one candidate. Every generation goes here."""
        try:
            obj = self.output_model.model_validate(data)
        except ValidationError as e:
            # One failure per offending field, not one opaque blob: a single
            # "schema.invalid" has nothing to route a repair on, and the retry
            # prompt reads as noise.
            fails: list[Fail] = []
            for err in e.errors()[:12]:
                loc = ".".join(str(x) for x in (err.get("loc") or ())) or "record"
                head = str((err.get("loc") or ["record"])[0])
                fails.append((f"{head}.schema_invalid", f"{loc}: {err.get('msg', '')}"))
            return None, fails or [("record.schema_invalid", str(e)[:300])]
        fails = []
        for g in self.gates:
            fails.extend(tuple(f) for f in g(obj))
        return obj, fails

    # -- generation ------------------------------------------------------- #
    def generate(self, user_prompt: str, *, verbose: bool = False) -> Result:
        convo: list[dict] = [{"role": "user", "content": user_prompt}]
        messages_head = [{"role": "system", "content": self.system_prompt}] if self.system_prompt else []
        res = Result(ok=False, model=self.model)
        started = time.time()
        ladder = list(self._ladder)

        for i in range(1, self.attempts + 1):
            mode = ladder[0]
            messages = messages_head + convo
            prompt_chars = sum(len(m["content"]) for m in messages)
            kwargs: dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature,
                "max_tokens": fit_max_tokens(prompt_chars, self.max_tokens, self.context_window),
                **mode_kwargs(mode, self.schema, self.schema_name, strict=self.strict),
                **self.extra_kwargs,
            }
            att = Attempt(index=i, mode=mode, ok=False)
            res.attempts.append(att)

            try:
                resp = call_with_retry(self.client, **kwargs)
            except Exception as e:  # noqa: BLE001 — a rejected constraint is data, not a crash
                att.api_error = f"{type(e).__name__}: {str(e)[:300]}"
                if len(ladder) > 1 and _looks_unsupported(e):
                    dropped = ladder.pop(0)
                    att.api_error += f"  -> demoting constraint mode {dropped} -> {ladder[0]}"
                if verbose:
                    print(f"  {att.summary()}", flush=True)
                continue

            choice = resp.choices[0]
            text = choice.message.content or ""
            att.finish_reason = getattr(choice, "finish_reason", "") or ""
            att.chars = len(text)
            usage = getattr(resp, "usage", None)
            if usage is not None:
                att.usage = {
                    "prompt_tokens": getattr(usage, "prompt_tokens", None),
                    "completion_tokens": getattr(usage, "completion_tokens", None),
                }

            data, perr = extract_json(text)
            if data is None:
                att.parse_error = perr
                if att.finish_reason == "length":
                    att.parse_error += " (finish_reason=length: raise --max-tokens or shrink the request)"
                feedback = f"That response was not usable JSON: {att.parse_error}"
            else:
                obj, fails = self.validate(data)
                att.failures = fails
                if not fails:
                    att.ok = True
                    res.ok, res.data, res.value, res.mode_used = True, data, obj, mode
                    res.failures = []
                    res.elapsed_s = time.time() - started
                    if verbose:
                        print(f"  {att.summary()}", flush=True)
                    return res
                feedback = "That output failed these checks:\n- " + "\n- ".join(f"{g}: {m}" for g, m in fails)

            res.failures = att.failures
            if verbose:
                print(f"  {att.summary()}", flush=True)
            if i < self.attempts:
                # Feed the failures back verbatim. The gate id plus the message
                # is a precise, machine-generated repair spec — far better than
                # "try again", and it is why attempt 2 usually lands.
                convo.append({"role": "assistant", "content": text[:20000]})
                convo.append({"role": "user", "content": feedback + "\nReturn the corrected single JSON object only."})

        res.elapsed_s = time.time() - started
        return res


# --------------------------------------------------------------------------- #
# Model discovery
# --------------------------------------------------------------------------- #
def list_models(client) -> list[str]:
    return sorted(m.id for m in client.models.list().data)


def resolve_model(client, requested: str | None) -> str:
    """Validate a requested model id against the live list, or auto-pick one.

    Worth the extra call: an unlisted model id fails as a 404 on every
    generation, which reads exactly like a broken prompt.
    """
    try:
        available = list_models(client)
    except Exception as e:  # noqa: BLE001 — listing is best-effort
        print(f"(could not list models: {e}; using {requested or FALLBACK_MODEL})")
        return requested or FALLBACK_MODEL
    if requested:
        if requested in available:
            return requested
        matches = [m for m in available if requested.lower() in m.lower()]
        if matches:
            return matches[0]
        raise SystemExit(f"Model '{requested}' is not callable with this key. Try --list-models.")
    for pref in MODEL_PREFERENCES:
        for m in available:
            if pref in m.lower():
                return m
    return available[0] if available else FALLBACK_MODEL


# --------------------------------------------------------------------------- #
# Writing a generation out: the artifact and its validation report together
# --------------------------------------------------------------------------- #
def write_run(out_dir: Path, name: str, result: Result, *, prompt: str = "") -> Path:
    """Persist a generation and its report. Rejects are kept, not discarded.

    A rejected candidate plus its gate ids is the most useful debugging asset
    you have: it tells you whether the prompt, the schema, or the model is
    wrong. Throwing it away leaves only an accept-rate number.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = "record" if result.ok else "rejected"
    if result.data is not None:
        (out_dir / f"{name}.{stem}.json").write_text(
            json.dumps(result.data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    report = result.report()
    if prompt:
        report["prompt"] = prompt
    path = out_dir / f"{name}.report.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


# --------------------------------------------------------------------------- #
# Worked example: this repo's Product model + its gates.
# Replace these two lines for another domain; the engine above does not change.
# --------------------------------------------------------------------------- #
def product_setup() -> tuple[type[BaseModel], list[Gate], str]:
    from schema import Product
    from validate import run_gates

    system = (
        "You are a senior hardware product design engineer. Given a product request, "
        "output ONE complete, genuinely buildable blueprint as a single JSON object "
        "conforming to the supplied schema. Rules: all ids are snake_case [a-z0-9_]; "
        "project.seed_project_id equals project.project_id and variant_type is 'seed'; "
        "every circuit net member references a pin declared on that component's pins "
        "list; every electrical component sits on at least one net; power_budget."
        "input_source is set and at least one protection measure is given; prototype "
        "steps are proto_1..proto_N in order with valid net refs and non-empty "
        "bring_up_checks; instruction phases appear in the order fabrication, wiring, "
        "bring_up, assembly, testing, with dependencies only on earlier step_ids; "
        "fabrication/bring_up/testing steps carry process, machine, or qc_check; any "
        "assembly step implying fastening lists tools or fasteners; no orphan component "
        "references anywhere; appearance.visual_description is at least 80 characters "
        "and names real parts or dimensions; image_generation_prompt.prompt is at least "
        "120 characters; sourcing line totals equal unit_cost_usd * quantity and "
        "cost_summary.total_usd equals their sum. Output only the JSON object."
    )
    return Product, [lambda p: run_gates(p)], system


# --------------------------------------------------------------------------- #
# Offline selftest — the whole loop, no API key, no network
# --------------------------------------------------------------------------- #
class _FakeClient:
    """Replays canned completions so the retry-and-gate loop can be tested."""

    def __init__(self, responses: list[Any]) -> None:
        self._responses = list(responses)
        self.calls: list[dict] = []
        self.chat = type("C", (), {"completions": self})()

    def create(self, **kwargs):
        self.calls.append(kwargs)
        r = self._responses.pop(0)
        if isinstance(r, Exception):
            raise r
        msg = type("M", (), {"content": r})()
        choice = type("Ch", (), {"message": msg, "finish_reason": "stop"})()
        usage = type("U", (), {"prompt_tokens": 100, "completion_tokens": 200})()
        return type("R", (), {"choices": [choice], "usage": usage})()


def selftest() -> None:
    class Item(BaseModel):
        item_id: str
        qty: int
        unit_usd: float
        total_usd: float

    class Order(BaseModel):
        order_id: str
        items: list[Item]
        note: str | None = None

    def totals_gate(o: Order) -> list[Fail]:
        out = []
        for it in o.items:
            if abs(it.qty * it.unit_usd - it.total_usd) > 0.005:
                out.append(("line.total", f"item '{it.item_id}': qty*unit != total"))
        return out

    # ---- schema shaping ---- #
    raw = Order.model_json_schema()
    assert "maxItems" not in json.dumps(raw), "fixture should start unbounded"
    s = prepare_schema(Order, max_items=7, stringify_numbers=True)
    assert s["properties"]["items"]["maxItems"] == 7, "arrays must be bounded"
    assert "note" in s["required"], "optional fields must be required for the grammar"
    item = s["$defs"]["Item"]
    assert item["properties"]["qty"] == {"type": "string", "pattern": INT_PATTERN}
    assert item["properties"]["unit_usd"] == {"type": "string", "pattern": NUM_PATTERN}
    assert Order.model_json_schema()["properties"]["items"].get("maxItems") is None, "must not mutate the model"
    only = prepare_schema(Order, only=["order_id"])
    assert set(only["properties"]) == {"order_id"} and only["required"] == ["order_id"]
    try:
        prepare_schema(Order, only=["nope"])
        raise AssertionError("unknown field must raise")
    except KeyError:
        pass

    # ---- parsing ---- #
    good = '{"a": 1}'
    assert extract_json(good)[0] == {"a": 1}
    assert extract_json("```json\n" + good + "\n```")[0] == {"a": 1}
    assert extract_json("<think>hmm, let me</think>\n" + good)[0] == {"a": 1}
    assert extract_json("Here you go:\n" + good + "\nHope that helps!")[0] == {"a": 1}
    assert extract_json(good + '\n{"b": 2}')[0] == {"a": 1}
    assert extract_json('{"s": "line one\nline two"}')[0]["s"].count("\n") == 1, "raw newline in string"
    assert extract_json("[1,2]")[0] is None and extract_json("")[0] is None
    assert extract_json("total nonsense")[0] is None

    # ---- context arithmetic ---- #
    assert fit_max_tokens(300, 4096, 128000) == 4096
    assert fit_max_tokens(30000, 13000, 16384) == 16384 - 10000 - 512
    assert fit_max_tokens(10**7, 13000, 16384) == 512, "never returns <= 0"

    # ---- constraint ladder ---- #
    assert "response_format" in mode_kwargs("json_schema", {}, "X")
    assert "strict" not in json.dumps(mode_kwargs("json_schema", {}, "X"))
    assert mode_kwargs("json_schema", {}, "X", strict=True)["response_format"]["json_schema"]["strict"] is True
    assert mode_kwargs("guided_json", {"t": 1}, "X")["extra_body"]["nvext"]["guided_json"] == {"t": 1}
    assert mode_kwargs("json_object", {}, "X") == {"response_format": {"type": "json_object"}}
    assert mode_kwargs("free", {}, "X") == {}

    # ---- validation splits schema errors per field ---- #
    g = StructuredGenerator(output_model=Order, model="fake", client=_FakeClient([]), gates=[totals_gate])
    _, fails = g.validate({"order_id": "a"})
    assert [f[0] for f in fails] == ["items.schema_invalid"], fails
    _, fails = g.validate({"order_id": "a", "items": [{"item_id": "x", "qty": 2, "unit_usd": 3.0, "total_usd": 99.0}]})
    assert [f[0] for f in fails] == ["line.total"], fails

    # ---- retry with feedback: bad totals, then corrected ---- #
    bad = json.dumps({"order_id": "o1", "items": [{"item_id": "x", "qty": 2, "unit_usd": 3.0, "total_usd": 99.0}]})
    fixed = json.dumps({"order_id": "o1", "items": [{"item_id": "x", "qty": 2, "unit_usd": 3.0, "total_usd": 6.0}]})
    fake = _FakeClient(["not json at all", bad, fixed])
    r = StructuredGenerator(
        output_model=Order, model="fake", client=fake, gates=[totals_gate], attempts=3, system_prompt="sys"
    ).generate("make an order")
    assert r.ok and r.value is not None and r.value.items[0].total_usd == 6.0
    assert [a.ok for a in r.attempts] == [False, False, True]
    assert r.attempts[0].parse_error and r.attempts[1].failures[0][0] == "line.total"
    assert "line.total" in fake.calls[2]["messages"][-1]["content"], "failures must reach the model"
    assert fake.calls[2]["messages"][0]["role"] == "system"
    assert len(fake.calls[2]["messages"]) == 6, "assistant+user turn appended per retry"
    rep = r.report()
    assert rep["ok"] and rep["attempts"] == 3 and len(rep["trace"]) == 3 and rep["final_failures"] == []

    # ---- exhausted attempts report the last failure, not a crash ---- #
    r2 = StructuredGenerator(
        output_model=Order, model="fake", client=_FakeClient([bad, bad]), gates=[totals_gate], attempts=2
    ).generate("make an order")
    assert not r2.ok and r2.value is None and r2.report()["gate_ids"] == ["line.total"]

    # ---- unsupported constraint demotes one rung, then succeeds ---- #
    fake3 = _FakeClient([Exception("400: response_format json_schema is not supported"), fixed])
    r3 = StructuredGenerator(
        output_model=Order, model="fake", client=fake3, gates=[totals_gate], attempts=2
    ).generate("make an order")
    assert r3.ok and r3.mode_used == "guided_json", r3.mode_used
    assert "demoting" in r3.attempts[0].api_error
    assert "response_format" not in fake3.calls[1] and "nvext" in json.dumps(fake3.calls[1]["extra_body"])

    # ---- a non-capability error does NOT demote, and retries transiently ---- #
    fake4 = _FakeClient([Exception("connection reset by peer"), fixed])
    r4 = StructuredGenerator(
        output_model=Order, model="fake", client=fake4, gates=[totals_gate], attempts=2, mode="json_schema"
    ).generate("x")
    assert r4.ok and r4.mode_used == "json_schema"

    # ---- forced single mode never demotes ---- #
    fake5 = _FakeClient([Exception("400: response_format not supported")])
    r5 = StructuredGenerator(
        output_model=Order, model="fake", client=fake5, gates=[], attempts=1, mode="json_schema"
    ).generate("x")
    assert not r5.ok and "demoting" not in r5.attempts[0].api_error

    # ---- the real Product model shapes cleanly, if this repo is present ---- #
    try:
        Product, gates, system = product_setup()
    except ImportError:
        print("  (skipped Product wiring: schema.py not importable)")
    else:
        ps = prepare_schema(Product, max_items=96)
        assert "$defs" in ps and ps["properties"]["components"]["maxItems"] == 96
        blob = json.dumps(ps)
        assert '"type": "array"' in blob and '"maxItems"' in blob
        for node in _iter_arrays(ps):
            assert "maxItems" in node, "every array bounded"
        assert len(system) > 500 and gates
        sample = next(iter(sorted((ROOT / "dataset" / "products").glob("*.json"))), None)
        if sample is not None:
            gen = StructuredGenerator(output_model=Product, model="fake", client=_FakeClient([]), gates=gates)
            obj, fails = gen.validate(json.loads(sample.read_text(encoding="utf-8-sig")))
            assert obj is not None and not fails, f"{sample.name} should pass: {fails}"
            print(f"  (validated real record {sample.name} through the engine)")

    print("selftest OK")


def _iter_arrays(node: Any):
    if isinstance(node, dict):
        if node.get("type") == "array":
            yield node
        for v in node.values():
            yield from _iter_arrays(v)
    elif isinstance(node, list):
        for v in node:
            yield from _iter_arrays(v)


# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description="Schema-constrained generation with per-generation validation.")
    ap.add_argument("prompt", nargs="*", help="the request to generate from")
    ap.add_argument("--model", default=os.environ.get("NVIDIA_MODEL"), help="model id (default: auto-select)")
    ap.add_argument("--base-url", default=os.environ.get("NVIDIA_BASE_URL", NVIDIA_BASE_URL))
    ap.add_argument("--mode", default="auto", choices=("auto", *MODES),
                    help="constraint mode; auto tries json_schema -> guided_json -> json_object -> free")
    ap.add_argument("--strict", action="store_true", help="send response_format.strict (OpenAI-style)")
    ap.add_argument("--attempts", type=int, default=3, help="generation attempts, failures fed back each time")
    ap.add_argument("--temperature", type=float, default=0.4)
    ap.add_argument("--max-tokens", type=int, default=16000)
    ap.add_argument("--context-window", type=int, default=int(os.environ.get("CONTEXT_WINDOW", "128000")))
    ap.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS, help="array cap in the decode schema")
    ap.add_argument("--stringify-numbers", action="store_true",
                    help="numerics as pattern-bounded strings (for backends whose grammar runs away)")
    ap.add_argument("--out", default="runs", help="directory for the record + validation report")
    ap.add_argument("--name", default=None, help="output file stem (default: derived from the record or a timestamp)")
    ap.add_argument("--print-schema", action="store_true", help="print the decode schema and exit")
    ap.add_argument("--list-models", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        selftest()
        return 0

    output_model, gates, system = product_setup()

    if args.print_schema:
        print(json.dumps(prepare_schema(output_model, max_items=args.max_items,
                                        stringify_numbers=args.stringify_numbers), indent=2))
        return 0

    prompt = " ".join(args.prompt).strip()
    if not prompt and not args.list_models:
        print('Nothing to generate. Try: python structured_gen.py "a USB-C desk lamp"')
        return 2

    load_env_file()
    if not api_key():
        print(f"ERROR: no API key (checked {', '.join(KEY_ENVS)} and .env).")
        return 1
    from openai import OpenAI

    client = OpenAI(base_url=args.base_url, api_key=api_key(), timeout=900.0, max_retries=0)

    if args.list_models:
        ids = list_models(client)
        print(f"{len(ids)} models callable with this key:")
        for m in ids:
            print(f"  {m}")
        return 0

    model = resolve_model(client, args.model)
    gen = StructuredGenerator(
        output_model=output_model,
        model=model,
        client=client,
        system_prompt=system,
        gates=gates,
        mode=args.mode,
        attempts=args.attempts,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
        context_window=args.context_window,
        max_items=args.max_items,
        stringify_numbers=args.stringify_numbers,
        strict=args.strict,
    )
    print(f"model={model}  mode={args.mode}  attempts={args.attempts}  gates={len(gates)}")
    print(f"prompt: {prompt}")
    result = gen.generate(prompt, verbose=True)

    name = args.name
    if name is None:
        pid = ((result.data or {}).get("project") or {}).get("project_id")
        name = pid if isinstance(pid, str) and pid else time.strftime("gen_%Y%m%d_%H%M%S")
    report_path = write_run(Path(args.out), name, result, prompt=prompt)

    if result.ok:
        print(f"\nACCEPTED in {len(result.attempts)} attempt(s) via {result.mode_used} in {result.elapsed_s:.1f}s")
    else:
        print(f"\nREJECTED after {len(result.attempts)} attempt(s) in {result.elapsed_s:.1f}s")
        for g, m in result.failures[:10]:
            print(f"  - {g}: {m}")
    print(f"report: {report_path}")
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())

