import { expect, test } from "@playwright/test";
import { open, W } from "./helpers";

test("an owner's record: nine tabs, a date range, a truck filter", async ({ page }) => {
  await open(page, "/owners?role=owner");
  await page.locator(".trow", { hasText: "Castillo Transport" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${W}/owners/CT\\?role=owner$`));
  await expect(page.getByRole("heading", { name: "Castillo Transport LLC" })).toBeVisible();

  const tabs = page.locator(".tabs .tab");
  await expect(tabs).toHaveCount(9);
  for (const name of ["Equipment", "Live tracking", "Loads & dispatch", "Fuel & expenses", "Statements", "Maintenance", "Documents", "Access & permissions", "Overview"]) {
    await tabs.filter({ hasText: name }).click();
    await expect(page.locator(".tabs .tab.on")).toContainText(name);
  }

  await page.getByRole("button", { name: "October" }).click();
  await expect(page.getByRole("button", { name: "October" })).toHaveClass(/on/);
  await page.locator(".chip5", { hasText: "T-1168" }).click();
  await expect(page.locator(".chip5.on")).toHaveText("T-1168");
});

test("a link that names a tab opens it", async ({ page }) => {
  await open(page, "/owners/CT?role=owner&ownerTab=eq");
  await expect(page.locator(".tabs .tab.on")).toContainText("Equipment");
  await open(page, "/finance/fuel?role=accounting&fuelTab=returns");
  await expect(page.locator(".tabs .tab.on")).toContainText("Quarterly returns");
});

test("editing an owner, cancelling, and opening their settlement", async ({ page }) => {
  await open(page, "/owners/CT?role=owner");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/owners/CT/edit\\?role=owner$`));
  await expect(page.getByRole("heading", { name: "Edit owner" })).toBeVisible();
  await expect(page.getByLabel(/Legal business name/)).toHaveValue("Castillo Transport LLC");

  await page.locator(".ph").getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/owners/CT\\?role=owner$`));

  await page.getByRole("button", { name: "Settlement" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/finance/statements/CT\\?role=owner$`));
  await expect(page.getByRole("heading", { name: "Owner settlement · Castillo Transport LLC" })).toBeVisible();
});

test("adding an owner: a person or a business, with the state picked from a list", async ({ page }) => {
  await open(page, "/owners?role=owner");
  await page.getByRole("button", { name: "Add owner" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/owners/new\\?role=owner$`));
  await expect(page.getByLabel(/First name/)).toBeVisible();

  await page.locator(".ent5 button", { hasText: "Business" }).click();
  await expect(page.getByLabel(/Legal business name/)).toBeVisible();
  await expect(page.getByLabel(/First name/)).toBeHidden();

  const state = page.locator(".main").getByRole("button", { name: /^State:/ });
  await state.click();
  const list = page.getByRole("listbox", { name: "State" });
  await expect(list.getByRole("option")).toHaveCount(51);
  await page.locator(".ddl .dds input").fill("okl");
  await expect(list.getByRole("option")).toHaveText([/Oklahoma/]);
  await list.getByRole("option").first().click();
  await expect(state).toContainText("Oklahoma");
});

test("an individual owner can be changed to a business while editing", async ({ page }) => {
  await open(page, "/owners/TR/edit?role=owner");
  await page.locator(".ent5 button", { hasText: "Business" }).click();
  await expect(page.getByLabel(/Legal business name/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edit owner" })).toBeVisible();
});

test("previewing an owner's portal from their record, and coming back", async ({ page }) => {
  await open(page, "/owners/PC?role=owner");
  await page.getByRole("button", { name: "Their portal" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/owners/PC/portal\\?role=owner$`));
  await expect(page.locator(".oport")).toContainText("Pecan Creek");
  await expect(page.getByRole("complementary", { name: "Main navigation" })).toBeHidden();

  await page.locator(".oport").getByRole("button", { name: /Back to/ }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/owners/PC\\?role=owner$`));
  await expect(page.locator(".tabs .tab.on")).toContainText("Access & permissions");
});

test("a truck's row opens its record; a name inside the row opens that person instead", async ({ page }) => {
  await open(page, "/equipment/trucks?role=ops");
  await page.locator(".trow", { hasText: "T-1102" }).locator(".td").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${W}/equipment/trucks/T-1102\\?role=ops$`));
  await expect(page.locator("h1")).toContainText("T-1102");

  await page.locator(".crumb").getByRole("button", { name: "Trucks" }).click();
  await page.locator(".trow", { hasText: "T-1108" }).getByRole("button", { name: "Ana Ruiz" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/drivers/ana-ruiz\\?role=ops$`));
  await expect(page.getByRole("heading", { name: "Ana Ruiz" })).toBeVisible();
});

test("trucks sort by a column and filter by tab", async ({ page }) => {
  await open(page, "/equipment/trucks?role=ops");
  const units = () => page.locator(".tb2 .trow .td:nth-child(2)").allInnerTexts();
  const byUnit = await units();
  expect(byUnit).toEqual([...byUnit].sort());

  await page.getByRole("button", { name: "Sort by Unit, sorted ascending" }).click();
  await expect(page.getByRole("button", { name: "Sort by Unit, sorted descending" })).toBeVisible();
  expect(await units()).toEqual([...byUnit].reverse());

  await page.getByRole("button", { name: "Sort by Year" }).click();
  await expect(page.getByRole("button", { name: /^Sort by Year, sorted/ })).toBeVisible();
  expect(await units()).not.toEqual([...byUnit].reverse());

  await page.locator(".tabs .tab", { hasText: "Team" }).click();
  await expect(page.locator(".tb2 .trow")).toHaveCount(2);
});

test("selecting trucks offers the bulk actions for trucks", async ({ page }) => {
  await open(page, "/equipment/trucks?role=ops&listSel=T-1117,T-1149,T-1160");
  await expect(page.locator(".bulk")).toContainText("3 selected");
  await expect(page.locator(".bulk")).toContainText("Schedule service");
});

test("statements: driver pay and owner settlements, down to one statement", async ({ page }) => {
  await open(page, "/finance/statements?role=owner");
  await expect(page.locator(".tabs .tab.on")).toContainText("Driver pay");
  await page.locator(".tabs .tab", { hasText: "Owner settlements" }).click();
  await page.locator(".tb2 .trow", { hasText: "Tom Reyes" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${W}/finance/statements/TR\\?role=owner$`));
  await expect(page.getByRole("heading", { name: "Owner settlement · Tom Reyes" })).toBeVisible();
});

test("a driver's row opens the profile with the qualification file", async ({ page }) => {
  await open(page, "/drivers");
  await page.locator(".trow", { hasText: "Marcus Bell" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${W}/drivers/marcus-bell$`));
  await expect(page.getByRole("heading", { name: "Marcus Bell" })).toBeVisible();
  await expect(page.locator(".main")).toContainText("Medical certificate");
});
