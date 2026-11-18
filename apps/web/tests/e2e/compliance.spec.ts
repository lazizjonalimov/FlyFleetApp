import { expect, test } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";

test("compliance: each item of the file, a figure that filters, the rules that decide dispatch, and the export", async ({ page }) => {
  const account = await signUp(page);
  const dana = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Dana", last_name: "Reyes", cdl_expiry: day(900), medical_cert_expiry: day(6) });
  await qualify(page, dana.id);
  const leah = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Leah", last_name: "Morgan", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  for (const type of ["mvr", "clearinghouse", "drug_test"]) await viaApp(page, "POST", `/drivers/${leah.id}/qualifications`, { type, expires_on: type === "drug_test" ? null : day(300) });

  await open(page, account, "safety");
  const table = page.locator(".sfg section").first();
  await expect(table.locator(".thead")).toContainText("DriverCDLMedical cardMVR reviewClearinghouseRoad testDrug testDispatchable");
  const leahRow = table.locator(".trow", { hasText: "Leah Morgan" });
  await expect(leahRow).toContainText("Missing");
  await expect(leahRow.locator(".badge")).toHaveText("Missing");
  const danaRow = table.locator(".trow", { hasText: "Dana Reyes" });
  await expect(danaRow).toContainText("6 days");
  await expect(danaRow.locator(".badge")).toHaveText("Expiring");
  await expect(page.locator(".kpi", { hasText: "Missing" })).toContainText("road test");
  await expect(page.locator(".kpi", { hasText: "Fully qualified" })).toContainText("0 / 2");

  // A figure narrows the matrix to what it counts, and clears again.
  await page.locator(".kpi", { hasText: "Missing" }).click();
  await expect(table.locator(".trow")).toHaveCount(1);
  await page.getByRole("button", { name: "Show every row" }).click();
  await expect(table.locator(".trow")).toHaveCount(2);

  // The reminder schedule ran on its own, and the rules say what keeps a driver off loads.
  const schedule = page.locator(".card", { hasText: "Reminder schedule" });
  await expect(schedule).toContainText("60 · 30 · 14 · 7 · 1 days");
  await expect(schedule).toContainText("1 · 0 failed");
  await page.getByRole("button", { name: "Reminder rules" }).click();
  const rules = page.getByRole("dialog", { name: "Reminder rules" });
  await expect(rules).toContainText("Medical card · Dana Reyes · 7 days out");
  await rules.getByRole("switch", { name: "Road test required before dispatch" }).click();
  await rules.getByRole("button", { name: "Save rules" }).click();
  await expect(page.locator(".toastw")).toContainText("Reminder rules saved");
  await expect(leahRow.locator(".badge")).toHaveText("Incomplete");

  // The export is the matrix as a spreadsheet.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  expect((await download).suggestedFilename()).toMatch(/^compliance-drivers-\d{4}-\d{2}-\d{2}\.csv$/);

  // The company's own file, item by item.
  await page.getByRole("button", { name: /^Organization/ }).click();
  await expect(table.locator(".thead")).toContainText("DocumentFileExpiresReviewedStatus");
  await expect(table.locator(".trow", { hasText: "Liability insurance" })).toContainText("Missing");
});
