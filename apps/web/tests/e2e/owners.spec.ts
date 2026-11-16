import { expect, test } from "@playwright/test";
import { day, live, open, signIn, signUp, unique, viaApp } from "./helpers";

test("a driver who buys their truck is linked, not typed in again, and becomes an owner-operator", async ({ page }) => {
  const account = await signUp(page);
  const portalEmail = `${unique("avery")}@example.com`;
  const driver = await viaApp<{ id: string; person_id: string }>(page, "POST", "/drivers", { first_name: "Avery", last_name: "Novak", phone: "312-555-0143", driver_type: "company", status: "active", pay_type: "per_mile", pay_rate: "0.60", cdl_expiry: day(500), medical_cert_expiry: day(300) });
  await viaApp(page, "POST", "/vehicles", { unit_number: "301", ownership: "owned", status: "active", make: "Peterbilt", year: 2021, registration_expiry: day(300), insurance_expiry: day(300), inspection_expiry: day(300) });

  await open(page, account, "owners");
  await expect(page.getByText("No owners yet")).toBeVisible();
  await page.getByRole("button", { name: "Add owner" }).first().click();
  await expect(page.getByRole("heading", { name: "Add owner", level: 1 })).toBeVisible();

  // Typing the phone finds the driver already on file: link instead of creating a second person.
  await page.locator("#of-ph").fill("(312) 555-0143");
  await expect(page.getByText("Avery Novak")).toBeVisible();
  await page.getByRole("button", { name: "Link" }).click();
  await expect(page.getByText("Linked", { exact: true })).toBeVisible();
  await page.locator("#of-email").fill("avery@example.com");
  await page.locator("#of-addr").fill("100 Main St");
  await page.locator("#of-city").fill("Joliet");
  await page.getByRole("button", { name: /^State:/ }).click();
  await page.getByPlaceholder("Search states").fill("Illin");
  await page.getByRole("option", { name: /Illinois/ }).click();
  await page.locator("#of-zip").fill("60431");

  // The unit, a new owner-operator lease, and who drives it: the owner.
  await page.getByRole("button", { name: /^Unit:/ }).click();
  await page.getByRole("option", { name: /301/ }).click();
  await page.getByRole("button", { name: /^Agreement:/ }).click();
  await page.getByRole("option", { name: /New owner-operator lease/ }).click();
  await page.getByLabel("Owner’s % of line haul").fill("72");
  await page.getByLabel("% of fuel surcharge").fill("100");
  await page.getByRole("button", { name: /^Who drives:/ }).click();
  await page.getByRole("option", { name: "The owner drives it" }).click();
  await expect(page.locator(".cat5")).toContainText("Owner-operator");
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await page.getByLabel("Login email").fill(portalEmail);
  await page.getByRole("button", { name: "Bookkeeper" }).click();
  await page.getByRole("button", { name: "Save and create sign-in" }).click();

  // The portal sign-in's temporary password is shown once.
  const dialog = page.getByRole("dialog", { name: "Owner portal sign-in created" });
  await expect(dialog).toBeVisible();
  const password = (await dialog.locator(".ro5").innerText()).trim();
  await dialog.getByRole("button", { name: "Open owner" }).click();
  await expect(page.getByRole("heading", { name: "Avery Novak", level: 1 })).toBeVisible();
  await expect(page.locator(".ph")).toContainText("Owner-operator");

  // One person: the driver profile now says they own equipment.
  const after = await viaApp<{ owner_id: string | null; full_name: string }>(page, "GET", `/drivers/${driver.id}`);
  expect(after.owner_id).toBeTruthy();
  await page.getByRole("button", { name: /^Equipment/ }).click();
  await expect(page.locator(".opg5")).toContainText("301");
  await expect(page.locator(".opg5")).toContainText("Owner-operator lease");

  // The owner signs in to their portal and sees only what the Bookkeeper preset allows.
  await page.context().clearCookies();
  await signIn(page, portalEmail, password);
  await page.waitForURL(/\/portal$/);
  await live(page);
  await expect(page.locator(".ptop")).toContainText("Avery Novak");
  await expect(page.getByRole("navigation", { name: "Owner portal" })).toContainText("Statements");
  await expect(page.getByRole("navigation", { name: "Owner portal" })).not.toContainText("Equipment");
  await expect(page.locator(".opbody")).toContainText("Not shared with you");
  await expect(page.locator(".nav")).toHaveCount(0); // no console sidebar for an owner
});

test("a business owner with its own driver on a fleet lease is a non-operating owner", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/vehicles", { unit_number: "410", ownership: "owned", status: "active", registration_expiry: day(300), insurance_expiry: day(300), inspection_expiry: day(300) });
  await open(page, account, "owners/new");
  await page.getByRole("button", { name: /^Business/ }).click();
  await page.locator("#of-legal").fill("Riverbend Leasing LLC");
  await page.locator("#of-ein").fill("47-1029384");
  await page.locator("#of-cfirst").fill("Casey");
  await page.locator("#of-clast").fill("Lund");
  await page.locator("#of-ctitle").fill("Managing member");
  await page.locator("#of-email").fill("office@riverbend-leasing.com");
  await page.locator("#of-ph").fill("512-555-0131");
  await page.locator("#of-addr").fill("1 River Rd");
  await page.locator("#of-city").fill("Austin");
  await page.getByRole("button", { name: /^State:/ }).click();
  await page.getByPlaceholder("Search states").fill("Tex");
  await page.getByRole("option", { name: /Texas/ }).click();
  await page.locator("#of-zip").fill("73301");
  await page.getByRole("button", { name: /^Unit:/ }).click();
  await page.getByRole("option", { name: /410/ }).click();
  await page.getByRole("button", { name: /^Agreement:/ }).click();
  await page.getByRole("option", { name: /New fleet lease/ }).click();
  await page.getByLabel("Owner’s % of line haul").fill("72");
  await page.getByRole("button", { name: /^Who drives:/ }).click();
  await page.getByRole("option", { name: "A driver the owner hires" }).click();
  await page.getByRole("switch", { name: "Give portal access" }).click(); // no portal for now
  await page.getByRole("button", { name: "Save owner" }).click();

  await expect(page.getByRole("heading", { name: "Riverbend Leasing LLC", level: 1 })).toBeVisible();
  await expect(page.locator(".ph")).toContainText("Non-operating owner");
  await expect(page.locator(".ph")).toContainText("Casey Lund, managing member");
  await page.getByRole("button", { name: /^Access & permissions/ }).click();
  await page.getByRole("button", { name: "Monitor only" }).click();
  await expect(page.getByRole("status")).toContainText("Portal permissions saved");

  await open(page, account, "owners");
  await page.getByRole("button", { name: /^Businesses/ }).click();
  await expect(page.locator(".tb2")).toContainText("Riverbend Leasing LLC");
  await expect(page.locator(".tb2")).toContainText("Casey Lund");
});
