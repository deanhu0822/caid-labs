import type { Draft, Source } from "./domain";
import { importFile } from "./inputs";

export const EXAMPLES = [
  {
    id: "compare",
    title: "Compare two components",
    description: "A parts list, a requirement, a clearer choice.",
    type: "CSV + notes",
    icon: "compare",
  },
  {
    id: "change",
    title: "Prepare a product change",
    description: "Keep the goal and its constraints together.",
    type: "Image + notes",
    icon: "change",
  },
  {
    id: "test",
    title: "Organize test results",
    description: "Bring observations back to their source.",
    type: "CSV + PDF",
    icon: "test",
  },
] as const;

function textSource(
  name: string,
  text: string,
  kind: "text" | "csv" = "text",
): Source {
  const mime = kind === "csv" ? "text/csv" : "text/plain";
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    mime,
    size: new Blob([text]).size,
    text,
    note: "",
    readNotice:
      "Illustrative example data. These are not measured results or manufacturer specifications.",
    status: "ready",
    blob: new Blob([text], { type: mime }),
  };
}

// These are authored fixtures, never measurements or recommendations about real hardware.
export async function loadExample(id: string): Promise<Draft> {
  if (id === "compare")
    return {
      request:
        "Choose a quieter fan.\nCompare these two options for a desktop air monitor. Keep the 5 V supply and the current 40 mm mounting space. Capture what we know and what needs a bench test.",
      sources: [
        textSource(
          "fan-options.csv",
          "Part,Supply,Size,Rated airflow,Rated noise\nFan A,5 V,40 × 40 mm,4.8 CFM,22 dBA\nFan B,5 V,40 × 40 mm,4.1 CFM,18 dBA",
          "csv",
        ),
        textSource(
          "design-notes.txt",
          "The current enclosure has 40 mm mounting space.\nKeep the existing 5 V supply.\nNoise at the desk matters more than maximum airflow.\nCheck airflow and temperature in the assembled enclosure before choosing a fan.",
        ),
      ],
    };
  if (id === "test") {
    const response = await fetch(`${import.meta.env.BASE_URL}examples/bench-conditions.pdf`);
    if (!response.ok) throw new Error("The sample PDF could not be opened.");
    const pdf = await importFile(
      new File([await response.blob()], "bench-conditions.pdf", {
        type: "application/pdf",
      }),
    );
    if (pdf.status === "error")
      throw new Error(pdf.error || "The example PDF could not be read.");
    return {
      request:
        "Review the air monitor bench test.\nKeep the observations separate from conclusions and note the missing test conditions.",
      sources: [
        textSource(
          "bench-results.csv",
          "Run,Fan setting,Temperature after 20 min,Noise at 0.5 m\n1,Low,31 °C,23 dBA\n2,Medium,28 °C,28 dBA\n3,High,26 °C,34 dBA",
          "csv",
        ),
        textSource(
          "test-notes.md",
          "The same prototype was used for all three runs.\nAmbient temperature was not recorded.\nRepeat each condition before drawing a conclusion.\nThe sound meter has not been calibrated.",
        ),
        pdf,
      ],
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 680;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("The example image could not be created in this browser.");
  context.fillStyle = "#e7ebe5";
  context.fillRect(0, 0, 1000, 680);
  context.fillStyle = "#fafaf5";
  context.fillRect(70, 60, 860, 560);
  context.fillStyle = "#34453b";
  context.font = "24px monospace";
  context.fillText("DESKTOP AIR MONITOR / EXAMPLE", 110, 120);
  context.strokeStyle = "#56665b";
  context.lineWidth = 3;
  context.strokeRect(140, 195, 330, 280);
  context.beginPath();
  context.arc(305, 335, 86, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(250, 280);
  context.lineTo(360, 390);
  context.moveTo(360, 280);
  context.lineTo(250, 390);
  context.stroke();
  context.font = "22px monospace";
  context.fillText("40 mm fan mount", 530, 240);
  context.fillText("5 V power supply", 530, 300);
  context.fillText("Keep enclosure", 530, 360);
  context.fillText("Target: less noise", 530, 420);
  context.font = "19px monospace";
  context.fillText(
    "Illustrative sketch. Dimensions require checking.",
    110,
    560,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not create example image.")),
      "image/png",
    ),
  );
  return {
    request:
      "Make the desktop air monitor quieter.\nKeep its enclosure. Use the sketch and notes to prepare a change brief.",
    sources: [
      {
        id: crypto.randomUUID(),
        name: "enclosure-sketch.png",
        kind: "image",
        mime: "image/png",
        size: blob.size,
        blob,
        text: "",
        note: "Keep the 40 mm fan mount and 5 V supply shown in the example sketch.",
        status: "reference",
      },
      textSource(
        "change-notes.txt",
        "Goal: reduce audible fan noise at a desk.\nKeep the enclosure, power supply, and sensor placement.\nCompare fan options before changing the enclosure.\nCheck airflow and sensor readings on the bench.",
      ),
    ],
  };
}
