import { expect, test } from "@playwright/test";
import { nav, open, W } from "./helpers";

test("a dispatcher is refused Invoices, told which permission is missing, and keeps the role while moving on", async ({ page }) => {
  await open(page, "/finance/invoices?role=dispatcher");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Jordan Lee");
  await expect(page.getByRole("heading", { name: "You don’t have access to Invoices" })).toBeVisible();
  await expect(page.locator(".forb")).toContainText("finance.invoices.read");
  await expect(nav(page, "Statements")).toHaveAccessibleName("Statements, no access");

  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/dashboard\\?role=dispatcher$`));
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});

test("money is shown to roles with finance access only", async ({ page }) => {
  await open(page, "/dashboard?role=owner");
  await expect(page.getByRole("region", { name: "Invoiced revenue by week" })).toBeVisible();
  await expect(page.locator(".kpi", { hasText: "Overdue invoices" })).toBeVisible();

  await open(page, "/dashboard?role=dispatcher");
  await expect(page.getByRole("region", { name: "Invoiced revenue by week" })).toBeHidden();
  await expect(page.locator(".kpi", { hasText: "Overdue invoices" })).toBeHidden();

  await open(page, "/loads?drawer=FF-24790&role=dispatcher");
  await expect(page.getByRole("complementary", { name: "Load details" })).toContainText("Financials are restricted");
  await expect(page.locator(".fb")).toContainText("Rates hidden for your role");
});

test("each role signs in as its own person with its own dashboard", async ({ page }) => {
  const people: [role: string, name: string, title: string][] = [
    ["owner", "Dana Kim", "Main Admin"],
    ["dispatcher", "Jordan Lee", "Dispatcher"],
    ["safety", "Rosa Delgado", "Safety Manager"],
    ["accounting", "Mei Chen", "Accounting"],
    ["fleet", "Owen Brooks", "Fleet Manager"],
  ];
  for (const [role, name, title] of people) {
    await open(page, `/dashboard?role=${role}`);
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText(name);
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText(title);
    await expect(page.locator(".kpis .kpi")).toHaveCount(6);
  }
  await open(page, "/dashboard?role=accounting");
  await expect(page.getByRole("heading", { name: "Billing overview" })).toBeVisible();
});

test("a dispatcher in a team sees the team's trucks only", async ({ page }) => {
  await open(page, "/dispatch?role=dispatcher&team=A");
  await expect(page.locator(".scope")).toHaveText("Team A · 14 trucks");
  await nav(page, "Loads").click();
  await expect(page).toHaveURL(new RegExp(`${W}/loads\\?role=dispatcher&team=A$`));
  await expect(page.locator(".scope")).toBeVisible();
});

test("an administrator previews a dispatch team as its lead, then returns", async ({ page }) => {
  await open(page, "/settings/dispatch-teams?role=owner");
  await page.getByRole("button", { name: /Preview/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`${W}/dispatch\\?role=owner$`));
  await expect(page.getByRole("status")).toContainText("Previewing as Jordan Lee");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Jordan Lee");

  // the preview holds while moving around
  await nav(page, "Loads").click();
  await expect(page.getByRole("status")).toContainText("Previewing as Jordan Lee");

  await page.getByRole("button", { name: "Exit preview" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/settings/dispatch-teams\\?role=owner$`));
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Dana Kim");
});

test("the platform operator has the platform's navigation; nobody else can open it", async ({ page }) => {
  await open(page, "/platform?role=platform");
  await expect(page.getByRole("button", { name: "Switch organization" })).toContainText("FlyFleet Platform");
  await expect(page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: /Organizations|Support sessions|Platform health|SaaS billing/ })).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();

  await open(page, "/platform");
  await expect(page.getByRole("heading", { name: /You don’t have access to/ })).toBeVisible();
});

test("an equipment owner gets their portal, with only the tabs their permissions allow", async ({ page }) => {
  await open(page, "/owner-portal");
  await expect(page.locator(".oport")).toContainText("Castillo Transport");
  await expect(page.locator(".oport .ptab")).toHaveText(["Overview", "Equipment", "Loads", "Statements", "Fuel & expenses", "Maintenance", "Documents"]);
  await page.locator(".oport .ptab", { hasText: "Statements" }).click();
  await expect(page.locator(".oport .ptab.on")).toHaveText("Statements");

  // the console is not theirs to open
  await open(page, "/dashboard?role=eqowner");
  await expect(page.locator(".oport")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeHidden();
});

test("the customer portal and the states reference stand on their own", async ({ page }) => {
  await open(page, "/portal");
  await expect(page.locator(".pship")).toHaveCount(4);
  await expect(page.locator(".pship.on")).toContainText("FF-24817");

  await open(page, "/states");
  await expect(page.getByRole("heading", { name: "States, handled the same way everywhere" })).toBeVisible();
  await expect(page.locator(".stt")).toHaveCount(8);
});
