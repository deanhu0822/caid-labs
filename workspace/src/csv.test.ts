import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("CSV source parsing", () => {
  it("reads quoted commas and escaped quotation marks", () => {
    expect(
      parseCsv('part,note\nJ12,"Cable, 4-pin"\nJ13,"Label says ""OUT"""'),
    ).toEqual([
      ["part", "note"],
      ["J12", "Cable, 4-pin"],
      ["J13", 'Label says "OUT"'],
    ]);
  });

  it("keeps embedded newlines within the same quoted cell", () => {
    expect(parseCsv('part,notes\nJ12,"Top connector\nRated 2 A"')).toEqual([
      ["part", "notes"],
      ["J12", "Top connector\nRated 2 A"],
    ]);
  });

  it("handles CRLF, Unicode, and a UTF-8 BOM", () => {
    expect(parseCsv('\uFEFF部品,仕様\r\n電源,"±5 V\r\nΔT ≤ 10°C"\r\n')).toEqual(
      [
        ["部品", "仕様"],
        ["電源", "±5 V\nΔT ≤ 10°C"],
      ],
    );
  });

  it("preserves trailing fields and variable row widths", () => {
    expect(parseCsv("part,qty,\nJ12,2,,extra\nJ13,")).toEqual([
      ["part", "qty", ""],
      ["J12", "2", "", "extra"],
      ["J13", ""],
    ]);
  });

  it("skips blank lines while preserving explicitly empty cells", () => {
    expect(parseCsv('\n\r\npart,qty\n\n,\n""\n')).toEqual([
      ["part", "qty"],
      ["", ""],
      [""],
    ]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv(" \n\r\n\t")).toEqual([]);
  });

  it("preserves formulas and HTML as strings", () => {
    expect(parseCsv("value\n=1+1\n<script>alert(1)</script>")).toEqual([
      ["value"],
      ["=1+1"],
      ["<script>alert(1)</script>"],
    ]);
  });

  it("permits whitespace after a closing quote without changing the cell", () => {
    expect(parseCsv('"Part" ,"qty"\n"J12"\t,2')).toEqual([
      ["Part", "qty"],
      ["J12", "2"],
    ]);
  });

  it("reports malformed quoting instead of silently misaligning data", () => {
    expect(() => parseCsv('part,note\nJ12,"never closed')).toThrow(
      /not closed/,
    );
    expect(() => parseCsv('part\n"J12"oops')).toThrow(/Unexpected text/);
    expect(() => parseCsv('part\nJ"12')).toThrow(/beginning of a field/);
  });
});
