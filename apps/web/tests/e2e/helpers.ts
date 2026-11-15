import { expect, type Page } from "@playwright/test";

/** The workspace every console address is in. */
export const W = "/lone-star-freight";

/** Opens a console address and waits for the console to be drawn for it. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path.startsWith("/") && !path.startsWith(W) && !/^\/(login|portal|states|owner-portal)/.test(path) ? W + path : path);
  await expect(page.locator(".ff")).toBeVisible();
}

/** The sidebar entry for a section. */
export const nav = (page: Page, label: string) =>
  page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}(,|$)`) });

/** Signs in the way a person does: the form, then the organization. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose an organization" })).toBeVisible();
  await page.locator(".orgc", { hasText: "Lone Star Freight" }).getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(`**${W}/dashboard`);
}

export const address = (page: Page): string => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};
