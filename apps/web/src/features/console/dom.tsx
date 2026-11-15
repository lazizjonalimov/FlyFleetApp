import { isValidElement } from "react";

/**
 * A value from the model as text. The text sits in its own span, which the stylesheet counts on in places
 * (`.mday span`, `.lgd span` and similar); nothing is rendered for a missing value or a boolean.
 */
export function tx(value: unknown): React.ReactNode {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (isValidElement(value)) return value;
  return <span>{String(value)}</span>;
}
