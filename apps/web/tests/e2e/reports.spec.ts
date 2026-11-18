import { expect, test } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
type Load = { id: string; load_number: string; version: number };

test("reports: on-time delivery by week and by customer, then the loads still waiting for their POD", async ({ page }) => {
  const account = await signUp(page);
  const globex = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const initech = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Initech" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Dana", last_name: "Reyes", cdl_number: "D1234567", cdl_state: "TX", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  await qualify(page, driver.id);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-55", ...PAPERS });
  // Two deliveries: Globex's on time (due tomorrow), Initech's two hours late.
  const delivered: Load[] = [];
  for (const [customer, due] of [[globex.id, at(24 * 60)], [initech.id, at(-120)]] as const) {
    const stops = [
      { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: at(-600) },
      { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: due },
    ];
    let load = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer, commodity: "Paper", customer_rate: "1500.00", stops });
    load = await viaApp<Load>(page, "POST", "/dispatch/assignments", { load_id: load.id, driver_id: driver.id, vehicle_id: truck.id, version: load.version });
    for (const action of ["dispatch", "arrive", "depart", "arrive", "depart"]) load = await viaApp<Load>(page, "POST", `/loads/${load.id}/transitions`, { action, version: load.version });
    delivered.push(load);
  }

  // On-time delivery is the report a company sees first.
  await open(page, account, "reports");
  await expect(page.getByRole("heading", { name: "On-time delivery" })).toBeVisible();
  await expect(page.locator(".kpi", { hasText: "On-time delivery" })).toContainText("50.0%");
  await expect(page.locator(".kpi", { hasText: "Late deliveries" })).toContainText("1 of 2");
  await expect(page.locator(".kpi", { hasText: "Late deliveries" })).toContainText("50.0% of delivered stops");
  await expect(page.locator(".kpi", { hasText: "Average lateness" })).toContainText("min");
  await expect(page.getByRole("group", { name: /On-time delivery by week, from 50\.0% to 50\.0%/ })).toBeVisible();
  const rows = page.locator(".trow");
  await expect(rows.first()).toContainText("Initech");       // worst first
  await expect(rows.first()).toContainText("0%");
  await expect(rows.nth(1)).toContainText("Globex");
  await page.getByRole("button", { name: "Count", exact: true }).click();
  await expect(page.getByRole("group", { name: /On-time deliveries by week/ })).toBeVisible();

  // Both loads are delivered with no proof of delivery yet.
  await page.getByRole("navigation", { name: "Report catalog" }).getByRole("button", { name: "Delivered, awaiting POD" }).click();
  await expect(page.locator(".kpi", { hasText: "Loads waiting" })).toContainText("2");
  for (const load of delivered) await expect(page.locator(".trow", { hasText: load.load_number })).toContainText("Not received");
  await expect(page.locator(".trow", { hasText: delivered[0]!.load_number })).toContainText("Dana Reyes");
});
