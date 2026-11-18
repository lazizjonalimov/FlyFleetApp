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

test("the drivers list: when an assigned load starts, and drivers asked for their documents together", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const ready = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Ana", last_name: "Ruiz", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  await qualify(page, ready.id);
  await viaApp(page, "POST", "/drivers", { first_name: "Gil", last_name: "Gap", cdl_expiry: day(900), medical_cert_expiry: day(9) });
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-9", registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) });
  const pickup = new Date(Date.now() + 3 * 86_400_000);
  const load = await viaApp<{ id: string; version: number }>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", stops: [
    { type: "pickup", city: "Dallas", state: "TX", appt_start: pickup.toISOString() },
    { type: "delivery", city: "Austin", state: "TX", appt_start: new Date(pickup.getTime() + 86_400_000).toISOString() }] });
  await viaApp(page, "POST", "/dispatch/assignments", { load_id: load.id, driver_id: ready.id, vehicle_id: truck.id, version: load.version });

  await open(page, account, "drivers");
  const row = (name: string) => page.locator(".tb2 .trow", { hasText: name });
  // The company runs on the browser's time zone, which the test shares.
  const day3 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(pickup);
  await expect(row("Ana Ruiz")).toContainText(`Starts ${day3}`);
  await expect(row("Gil Gap")).toContainText("Not dispatchable");

  await row("Ana Ruiz").locator(".chk").click();
  await row("Gil Gap").locator(".chk").click();
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Request documents" }).click();
  const confirm = page.getByRole("dialog", { name: "Ask 2 drivers for documents?" });
  await confirm.getByRole("button", { name: "Send requests" }).click();
  await expect(page.locator(".toastw")).toContainText("1 driver asked · 1 not on the app (it’s in their conversation) · 1 driver had nothing due");
});
