/** Parse CSV into plain strings. Formulas, HTML, and URLs remain inert text. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  if (!text.trim()) return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let mode: "plain" | "quoted" | "closed" = "plain";
  let touched = false;
  let line = 1;

  const finishField = () => {
    row.push(field);
    field = "";
    mode = "plain";
  };
  const finishRow = () => {
    if (touched || row.length > 0 || field.length > 0) {
      finishField();
      rows.push(row);
    }
    row = [];
    field = "";
    mode = "plain";
    touched = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (mode === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          mode = "closed";
        }
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        field += "\n";
        line += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (character === ",") {
      finishField();
      touched = true;
    } else if (character === "\r" || character === "\n") {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
    } else if (mode === "closed") {
      if (character !== " " && character !== "\t") {
        throw new Error(
          `Unexpected text after a quoted value on line ${line}.`,
        );
      }
    } else if (character === '"') {
      if (field)
        throw new Error(
          `A quoted value must start at the beginning of a field on line ${line}.`,
        );
      mode = "quoted";
      touched = true;
    } else {
      field += character;
      touched = true;
    }
  }
  if (mode === "quoted")
    throw new Error(`A quoted value is not closed near line ${line}.`);
  finishRow();
  return rows;
}
