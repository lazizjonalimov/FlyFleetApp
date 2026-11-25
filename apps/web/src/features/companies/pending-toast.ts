/**
 * A confirmation to show once the next page has opened. Moving to another company remounts the workspace, and
 * with it the toast, so the message waits here for the new page.
 */
const KEY = "ff.pending-toast";

export function rememberToast(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // storage refused: the confirmation is simply not shown
  }
}

export function takeToast(): string | null {
  try {
    const text = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return text;
  } catch {
    return null;
  }
}
