/**
 * The rules a new password must meet and how strong it is, as you type. They mirror the API's
 * (backend/app/core/passwords.py), which checks them again and has the last word.
 */
export const MIN_LENGTH = 12;
export const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"] as const;

export type Rule = { key: string; label: string; met: boolean };

export function rules(password: string, current = ""): Rule[] {
  return [
    { key: "length", label: `At least ${MIN_LENGTH} characters`, met: password.length >= MIN_LENGTH },
    { key: "case", label: "Upper and lower case letters", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { key: "number", label: "A number", met: /[0-9]/.test(password) },
    { key: "different", label: "Different from your current password", met: password.length > 0 && password !== current },
  ];
}

/** 0 (weak) to 3 (strong): length and the kinds of character used. */
export function strength(password: string): number {
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= MIN_LENGTH && kinds >= 3) score += 1;
  if (password.length >= 16 || (password.length >= MIN_LENGTH && kinds === 4)) score += 1;
  return Math.min(score, 3);
}
