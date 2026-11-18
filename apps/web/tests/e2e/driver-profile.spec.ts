import { expect, test } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";

test("a driver's profile: the file item by item, asking for a document, revealing details, and each tab", async ({ page }) => {
  const account = await signUp(page);
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Marcus", last_name: "Bell", cdl_number: "D1234567", cdl_state: "TX", cdl_class: "A", endorsements: "T", cdl_expiry: day(900), medical_cert_expiry: day(6) });
  await qualify(page, driver.id);

  await open(page, account, `drivers/${driver.id}`);
  await expect(page.locator(".ph")).toContainText("Medical card · 6 days");
  const banner = page.locator(".banner");
  await expect(banner).toContainText("Medical certificate expires in 6 days");
  await expect(banner).toContainText("When it lapses FlyFleet stops new assignments for Marcus until a reviewed replacement is on file");
  const file = page.locator(".card", { hasText: "Qualification file" });
  await expect(file.locator(".trow").first()).toContainText("CDL — Class ATexas · endorsements: TValid");
  await expect(file.locator(".trow", { hasText: "Medical certificate" })).toContainText("Expires in 6 days");
  await expect(file.locator(".trow", { hasText: "Road test certificate" })).toContainText("On file");

  // Asking for the document: Marcus isn't on the app, and the screen says so.
  await banner.getByRole("button", { name: "Request document" }).click();
  await expect(page.locator(".toastw")).toContainText("Marcus Bell isn’t on the driver app, so the request wasn’t sent");

  // Sensitive details show on request, and the reveal is logged.
  const sensitive = page.locator(".card", { hasText: "Sensitive details" });
  await expect(sensitive).toContainText("•••• 4567");
  await sensitive.getByRole("button", { name: "Reveal · logged to audit" }).click();
  await expect(sensitive).toContainText("D1234567");
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Last 30 days" }) })).toContainText("Speeding incidents0");

  // The other tabs.
  await page.getByRole("tab", { name: /^Qualifications/ }).click();
  const records = page.locator(".card", { hasText: "Records kept by hand" });
  await expect(records).toContainText("MVR — annual review");
  await records.getByRole("button", { name: "Add record" }).click();
  const add = page.getByRole("dialog", { name: "Add record" });
  await add.getByLabel("Item").selectOption({ label: "Hazmat endorsement" });
  await add.getByLabel("Runs to").fill(day(200));
  await add.getByRole("button", { name: "Add record" }).click();
  await expect(records).toContainText("Hazmat endorsement");
  await page.getByRole("tab", { name: "Location & privacy" }).click();
  await expect(page.locator(".card", { hasText: "Last position" })).toContainText("No position yet");
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.locator(".card", { hasText: "From the audit log" })).toContainText("Sensitive revealed");
  await expect(page.locator(".card", { hasText: "From the audit log" })).toContainText("Document requested");
});
