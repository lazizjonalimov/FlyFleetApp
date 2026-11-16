import { expect, test } from "@playwright/test";
import { live, nav, open, signIn, signUp, unique } from "./helpers";

test("a member added with a role sees only what the role allows", async ({ page, browser }) => {
  const account = await signUp(page);
  await open(page, account, "settings/team");
  await page.getByRole("button", { name: "Add member" }).click();
  const dialog = page.getByRole("dialog", { name: "Add member" });
  const email = `${unique("safety")}@example.com`;
  await dialog.getByLabel("Name *").fill("Sid Safety");
  await dialog.getByLabel("Work email *").fill(email);
  await dialog.getByLabel("Role *").selectOption("safety_manager");
  await dialog.getByLabel("Temporary password").fill("a long temporary pass");
  await dialog.getByRole("button", { name: "Add member" }).click();
  await expect(page.locator(".tbody")).toContainText("Sid Safety");

  const other = await (await browser.newContext()).newPage();
  await signIn(other, email, "a long temporary pass");
  await other.waitForURL(/\/dashboard$/);
  await live(other);
  await expect(other.getByRole("button", { name: "Account menu" })).toContainText("Safety manager");
  await expect(nav(other, "Invoices")).toHaveAttribute("aria-label", /no access/);
  await open(other, account, "finance/invoices");
  await expect(other.locator(".main")).toContainText("You don’t have access to Invoices");
});

test("company settings are saved", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "settings/integrations");
  await expect(page.locator(".main")).toContainText("No integrations connected");
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByLabel("MC number").fill("MC-445566");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Company settings saved");
  await expect(page.getByRole("button", { name: "Switch organization" })).toContainText("MC-445566");
});
