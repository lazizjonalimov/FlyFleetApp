import { expect, test } from "@playwright/test";
import { live, nav, open, PASSWORD, signIn, signUp, viaApp } from "./helpers";

test("a new company starts empty: no sample records anywhere", async ({ page }) => {
  const account = await signUp(page, "Fresh Freight");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Olive Owner");
  await expect(page.getByRole("button", { name: "Switch organization" })).toContainText("Fresh Freight");
  await expect(page.locator(".main")).toContainText("Nothing needs you right now");

  for (const [path, empty] of [
    ["loads", "No loads yet"],
    ["drivers", "No drivers yet"],
    ["customers", "No customers yet"],
    ["equipment/trucks", "No trucks yet"],
    ["finance/invoices", "No invoices yet"],
    ["owners", "No owners yet"],
    ["tracking", "Live positions need a telematics connection"],
    ["messages", "No conversations yet"],
  ] as const) {
    await open(page, account, path);
    await expect(page.locator(".main")).toContainText(empty);
  }
});

test("sign out, sign in again, and a wrong password says so", async ({ page }) => {
  const account = await signUp(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);

  await signIn(page, account.email, "not the password");
  await expect(page.getByRole("alert")).toBeVisible();

  await signIn(page, account.email, PASSWORD);
  await page.waitForURL(/\/dashboard$/);
  await live(page);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});

test("an account with two companies chooses one, and can switch", async ({ page }) => {
  const account = await signUp(page, "First Freight");
  await viaApp(page, "POST", "/account/companies", { name: "Second Freight", copy_from: null });
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);

  await signIn(page, account.email);
  await expect(page.getByRole("heading", { name: "Choose an organization" })).toBeVisible();
  await page.locator(".orgc", { hasText: "Second Freight" }).getByRole("button").click();
  await page.waitForURL(/\/dashboard$/);
  await live(page);
  await expect(page.getByRole("button", { name: "Switch organization" })).toContainText("Second Freight");

  await page.getByRole("button", { name: "Switch organization" }).click();
  await expect(page.getByRole("heading", { name: "Choose an organization" })).toBeVisible();
  await page.locator(".orgc", { hasText: "First Freight" }).getByRole("button").click();
  await page.waitForURL(/\/dashboard$/);
  await live(page);
  await expect(page.getByRole("button", { name: "Switch organization" })).toContainText("First Freight");
});

test("signed out, the workspace sends you to sign in; an unknown company is not found", async ({ page }) => {
  await page.goto("/acme-trucking/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const account = await signUp(page);
  const response = await page.goto(`/not-${account.slug}/dashboard`);
  expect(response?.status()).toBe(404);
});

test("search finds a record and the sidebar marks the section", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/customers", { name: "Globe Paper Co", payment_terms_days: 30 });
  await open(page, account, "dashboard");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search everything" });
  await expect(palette).toBeVisible();
  await palette.getByRole("textbox").fill("globe");
  await palette.getByRole("button", { name: /Globe Paper Co/ }).click();
  await expect(nav(page, "Customers")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".main")).toContainText("Globe Paper Co");
});
