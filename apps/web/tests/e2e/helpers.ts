import { expect, type Page } from "@playwright/test";

/** The workspace every console address is in. */
export const W = "/lone-star-freight";

/**
 * Waits until the console on the page answers to input. The server sends it already drawn, and the browser
 * draws it again for the full address and starts listening a moment later; a key pressed in between is lost.
 */
export async function live(page: Page): Promise<void> {
  await expect(page.locator(".ff")).toBeVisible();
  // React leaves a key of its own on every element it runs; the server's markup has none
  await page.waitForFunction(() => {
    const root = document.querySelector(".ff");
    return root !== null && Object.keys(root).some((key) => key.startsWith("__reactFiber$"));
  });
  // keyboard handling is attached right after the first draw
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0))));
}

/** Opens a console address and waits for the console to be drawn for it and ready for input. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path.startsWith("/") && !path.startsWith(W) && !/^\/(login|portal|states|owner-portal)/.test(path) ? W + path : path);
  await live(page);
}

/** The sidebar entry for a section. */
export const nav = (page: Page, label: string) =>
  page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}(,|$)`) });

/** Signs in the way a person does: the form, then the organization. */
export async function signIn(page: Page): Promise<void> {
  await open(page, "/login");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose an organization" })).toBeVisible();
  await page.locator(".orgc", { hasText: "Lone Star Freight" }).getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(`**${W}/dashboard`);
}

export const address = (page: Page): string => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};
