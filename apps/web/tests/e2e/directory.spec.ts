import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

test("adding a customer from the list", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "customers");
  await page.getByRole("button", { name: "New customer" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New customer" });
  await dialog.getByLabel("Name *").fill("Riverbend Paper");
  await dialog.getByLabel("Billing email").fill("ap@riverbend-paper.com");
  await dialog.getByRole("button", { name: "New customer" }).click();
  await expect(page.getByRole("status")).toContainText("Riverbend Paper added");
  await expect(page.locator(".tb2")).toContainText("Riverbend Paper");
  await expect(page.locator(".tb2")).toContainText("ap@riverbend-paper.com");
});

test("adding a driver from Create, then opening and editing the record", async ({ page }) => {
  const account = await signUp(page);
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: /Add a driver/ }).click();
  await page.getByRole("dialog", { name: "Add a driver" }).getByRole("button", { name: /Enter manually/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add a driver" });
  await dialog.getByRole("button", { name: "Create driver" }).click();
  await expect(dialog.getByText("Enter first name")).toBeVisible();
  await dialog.getByLabel("First name *").fill("Casey");
  await dialog.getByLabel("Last name *").fill("Lund");
  await dialog.getByLabel("CDL expires").fill(day(400));
  await dialog.getByLabel("Medical card expires").fill(day(10));
  await dialog.getByRole("button", { name: "Create driver" }).click();

  await expect(page).toHaveURL(new RegExp(`/${account.slug}/drivers/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "Casey Lund", level: 1 })).toBeVisible();
  await expect(page.locator(".main")).toContainText("Medical certificate");
  await expect(page.locator(".main")).toContainText("Expiring soon");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit driver" });
  await expect(edit.getByLabel("First name *")).toHaveValue("Casey");
  await edit.getByLabel("Mobile").fill("312-555-0143");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".ph")).toContainText("312-555-0143");

  await open(page, account, "drivers");
  await expect(page.locator(".tb2")).toContainText("Casey Lund");
});

test("trucks and trailers: added, listed, and blocked when a paper has lapsed", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/vehicles", { unit_number: "701", ownership: "owned", status: "active", year: 2022, registration_expiry: day(-3) });
  await open(page, account, "equipment/trucks");
  await expect(page.locator(".tb2")).toContainText("701");
  await expect(page.locator(".trow", { hasText: "701" })).toContainText("Not dispatchable");
  await page.locator(".trow", { hasText: "701" }).click();
  await expect(page.getByRole("heading", { name: "701", level: 1 })).toBeVisible();
  await expect(page.locator(".main")).toContainText("can’t be dispatched");

  await open(page, account, "equipment/trailers");
  await page.getByRole("button", { name: "Add trailer" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a trailer" });
  await dialog.getByRole("button", { name: /Enter manually/ }).click();
  await dialog.getByLabel("Unit number *").fill("5501");
  await dialog.getByRole("button", { name: /^Type:/ }).click();
  await dialog.getByRole("option", { name: "Reefer" }).click();
  await dialog.getByRole("button", { name: "Create trailer" }).click();
  await expect(page.getByRole("heading", { name: "5501", level: 1 })).toBeVisible();
  await expect(page.locator(".ph")).toContainText("Reefer");
});
