import { expect, test } from "@playwright/test";
import { live, signUp, viaApp } from "./helpers";

test("switching companies in place, and working in all of them", async ({ page }) => {
  const account = await signUp(page, "Acme Trucking");
  await viaApp(page, "POST", "/customers", { name: "Globex" });
  const bravo = await viaApp<{ id: string; slug: string }>(page, "POST", "/account/companies", { name: "Bravo Logistics" });
  await page.evaluate(async (company) => {
    await fetch("/api/v1/customers", { method: "POST", headers: { "Content-Type": "application/json", "X-Company": company }, body: JSON.stringify({ name: "Initech" }) });
  }, bravo.slug);

  await page.goto(`/${account.slug}/customers`);
  await live(page);
  await expect(page.locator(".trow", { hasText: "Globex" })).toBeVisible();

  // The switcher opens in place, with All companies first, and keeps the page.
  await page.getByRole("button", { name: "Switch company" }).click();
  const menu = page.getByRole("menu", { name: "Switch company" });
  await expect(menu.getByRole("menuitemradio").first()).toContainText("All companies");
  await expect(menu).toContainText("Bravo Logistics");
  await menu.getByRole("menuitemradio", { name: /Bravo Logistics/ }).click();
  await page.waitForURL(new RegExp(`/${bravo.slug}/customers`));
  await live(page);
  await expect(page.locator(".toastw")).toContainText("Switched to Bravo Logistics, same page");
  await expect(page.locator(".trow", { hasText: "Initech" })).toBeVisible();
  await expect(page.locator(".trow", { hasText: "Globex" })).toHaveCount(0);

  // All companies: one list with a Company column and a Company filter, and both companies' rows.
  await page.getByRole("button", { name: "Switch company" }).click();
  await page.getByRole("menuitemradio", { name: /All companies/ }).click();
  await page.waitForURL(/\/all\/customers/);
  await live(page);
  await expect(page.locator(".trow", { hasText: "Globex" })).toContainText("Acme Trucking");
  await expect(page.locator(".trow", { hasText: "Initech" })).toContainText("Bravo Logistics");
  await expect(page.getByText("Company", { exact: true }).first()).toBeVisible();

  // A link into another of your companies opens directly, with no prompt; a stranger's slug says there's no access.
  await page.goto(`/${bravo.slug}/customers`);
  await live(page);
  await expect(page.locator(".trow", { hasText: "Initech" })).toBeVisible();
  await page.goto("/someone-else-123456/customers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You don’t have access to this company");
});
