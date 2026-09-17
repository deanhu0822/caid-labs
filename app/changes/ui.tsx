"use client";
import type { ReactNode } from "react";
export function Input({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <label className="cw-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          rows={Math.min(12, Math.max(3, Math.ceil(value.length / 80)))}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
        />
      ) : type === "number" ? (
        <input
          type="number"
          step="any"
          defaultValue={value === "NaN" ? "" : value}
          onChange={(e) =>
            onChange(e.target.value === "" ? "NaN" : e.target.value)
          }
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={type === "number" ? undefined : 200}
        />
      )}
    </label>
  );
}
export function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="cw-section" id={`step-${number}`}>
      <header>
        <span className="cw-step">{number}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}
