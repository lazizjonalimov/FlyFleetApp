import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

test("a truck speeding on the live map: the incident, who was told, acknowledged and resolved", async ({ page }) => {
  const account = await signUp(page);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-55", ...PAPERS });
  // Sustained 75-77 mph for three minutes near Temple, TX, as the truck's telematics would send it.
  const samples = [75, 76, 77, 76, 75, 76, 77].map((mph, i) => ({ vehicle_id: truck.id, recorded_at: ago(3 - i * 0.5), lat: 31.1 - i * 0.004, lon: -97.34, speed_mph: mph, heading: 180, accuracy_m: 5 }));
  await viaApp(page, "POST", "/positions", { samples });

  await open(page, account, "tracking");
  await expect(page.locator(".mtop")).toContainText("1 reporting · positions from vehicle telematics");
  const row = page.getByRole("region", { name: "Vehicles" }).getByRole("button", { name: /^T-55 / });
  await expect(row).toContainText("77 mph");
  await expect(row).toContainText("Southbound near Temple, TX · speeding");
  await expect(page.getByRole("button", { name: "Alerts 1", exact: false })).toBeVisible();
  await row.click();
  const panel = page.getByRole("region", { name: "Truck T-55" });
  await expect(panel).toContainText("Speeding incident");
  await expect(panel).toContainText("Not acknowledged");
  await expect(panel).toContainText("Detected — above 73 mph for 3 min");
  await expect(panel).toContainText("Escalates to safety manager if not acknowledged");
  await expect(panel).toContainText("Measured against the company threshold in policy “Highway sustained speeding v1”");
  await panel.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByRole("status")).toContainText("Acknowledged");
  await expect(panel.locator(".tag", { hasText: "Acknowledged" })).toBeVisible();
  await panel.getByRole("button", { name: "Resolve…" }).click();
  await panel.getByLabel("What was done").fill("Called the driver; slowed down");
  await panel.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Resolved");
  await expect(panel).not.toContainText("Speeding incident");

  await open(page, account, "alerts");
  await page.getByRole("button", { name: /^Resolved/ }).click();
  await expect(page.locator(".trow", { hasText: "Above 73 mph for 3 min" })).toContainText("Resolved");
});

test("fleet alerts follow the loads, and a policy saves as a new version", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Ken", last_name: "Ito", cdl_expiry: day(400), medical_cert_expiry: day(400) });
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-77", ...PAPERS });
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const load = await viaApp<{ id: string; load_number: string; version: number }>(page, "POST", "/loads", {
    customer_id: customer.id, customer_rate: "1200.00", stops: [
      { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: inHours(3) },
      { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: inHours(9) }] });

  await open(page, account, "alerts");
  const waiting = page.locator(".trow", { hasText: "with no driver" });
  await expect(waiting).toContainText(load.load_number);
  await expect(waiting).toContainText("Unassigned");
  await expect(waiting.getByRole("button", { name: "Assign" })).toBeVisible();
  await page.getByRole("button", { name: /^Late & at risk/ }).click();
  await expect(page.locator(".trow", { hasText: "with no driver" })).toBeVisible();

  await viaApp(page, "POST", "/dispatch/assignments", { load_id: load.id, driver_id: driver.id, vehicle_id: truck.id, version: load.version });
  await open(page, account, "alerts");
  await expect(page.locator(".trow", { hasText: "with no driver" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Resolved/ }).click();
  await expect(page.locator(".trow", { hasText: "with no driver" })).toContainText("Resolved");

  await page.getByRole("button", { name: "Alert policies" }).click();
  await expect(page.getByRole("heading", { name: "Fleet alert policies", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Highway sustained speeding v1/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Threshold").fill("65");
  await expect(page.locator(".pfields")).toContainText("Alerts start above 68");
  await page.getByRole("button", { name: "Save as v2" }).click();
  await expect(page.getByRole("status")).toContainText("Highway sustained speeding saved as v2");
  await expect(page.getByRole("button", { name: /Highway sustained speeding v2/ })).toBeVisible();
  await page.getByRole("button", { name: "Versions" }).click();
  await expect(page.locator(".card", { hasText: "Versions · Highway sustained speeding" })).toContainText("v2");
  await expect(page.locator(".card", { hasText: "Versions · Highway sustained speeding" })).toContainText("Standard rule");
});
