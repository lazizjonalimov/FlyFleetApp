import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
const driver = (first: string, last: string) => ({ first_name: first, last_name: last, cdl_expiry: day(400), medical_cert_expiry: day(400) });

test("a truck's record: assign a team, see who owns it and its history", async ({ page }) => {
  const account = await signUp(page);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "812", year: 2023, make: "Volvo", model: "VNL 760", engine: "Volvo D13 · 500 hp", ...PAPERS });
  await viaApp(page, "POST", "/drivers", driver("Ken", "Ito"));
  await viaApp(page, "POST", "/drivers", driver("Katie", "Walsh"));

  await open(page, account, `equipment/trucks/${truck.id}`);
  await expect(page.getByRole("heading", { name: "812", level: 1 })).toBeVisible();
  await expect(page.locator(".ph")).toContainText("Company fleet");
  await expect(page.locator(".main")).toContainText("Volvo D13 · 500 hp");
  await expect(page.locator(".main")).toContainText("Nobody is assigned to this truck.");

  await page.getByRole("button", { name: "Assign driver" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign a driver to 812" });
  await dialog.getByRole("button", { name: /^Driver:/ }).click();
  await dialog.getByRole("option", { name: "Ken Ito" }).click();
  await dialog.getByText("Team truck · two drivers, one truck").click();
  await dialog.getByRole("button", { name: /^Co-driver:/ }).click();
  await dialog.getByRole("option", { name: "Katie Walsh" }).click();
  await dialog.getByRole("radio", { name: "By the miles each one drove" }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("812: drivers set");
  await expect(page.locator(".banner", { hasText: "Team truck" })).toContainText("Ken and Katie run it together and split pay by the miles each one drove");
  await expect(page.locator(".card", { hasText: "Assignment history" })).toContainText("Team with Katie Walsh · by miles");
  await expect(page.locator(".card", { hasText: "Owner and agreement" })).toContainText("None · company equipment");
  await expect(page.locator(".card", { hasText: "Ownership history" })).toContainText("Owned outright");
});

test("the trucks table: filter by make, change status in bulk, hide a column, export", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/vehicles", { unit_number: "901", make: "Volvo", year: 2022, vin: "4V4NC9EH5NN000901", ...PAPERS });
  await viaApp(page, "POST", "/vehicles", { unit_number: "902", make: "Volvo", year: 2023, ...PAPERS });
  await viaApp(page, "POST", "/vehicles", { unit_number: "903", make: "Mack", year: 2021, ...PAPERS });
  await open(page, account, "equipment/trucks");
  await expect(page.locator(".kpis")).toContainText("Owned by outside owners");

  await page.getByRole("button", { name: "Filter by make" }).click();
  await page.getByRole("option", { name: /Volvo/ }).click();
  await expect(page.getByRole("button", { name: "Remove filter Make: Volvo" })).toBeVisible();
  await expect(page.locator(".tb2 .trow")).toHaveCount(2);

  await page.locator(".trow", { hasText: "901" }).locator(".chk").click();
  await page.locator(".trow", { hasText: "902" }).locator(".chk").click();
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog", { name: "Change the status of 2 trucks" });
  await dialog.getByRole("radio", { name: "In the shop" }).click();
  await dialog.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByRole("status")).toContainText("2 trucks · status changed");
  await expect(page.locator(".trow", { hasText: "901" })).toContainText("In the shop");

  await page.getByRole("button", { name: "Remove filter Make: Volvo" }).click();
  await expect(page.locator(".tb2 .trow")).toHaveCount(3);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("group", { name: "Columns" }).getByText("VIN", { exact: true }).click();
  await page.reload();
  await expect(page.locator(".thead")).not.toContainText("VIN");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^vehicles-\d{4}-\d{2}-\d{2}\.csv$/);
});
