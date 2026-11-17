import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const route = (pickup: string, delivery: string) => [
  { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: pickup },
  { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: delivery },
];
type Load = { id: string; load_number: string; version: number; status: string };

test("needs attention: each exception with its own action, done from the dashboard", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Dana", last_name: "Reyes", cdl_number: "D1234567", cdl_state: "TX", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-55", ...PAPERS });
  // A pickup in two hours with nobody on it.
  const waiting = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "2500.00", stops: route(at(120), at(480)) });
  // A load hauled and delivered, with no proof of delivery yet.
  let hauled = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "1800.00", stops: route(at(-600), at(-120)) });
  hauled = await viaApp<Load>(page, "POST", "/dispatch/assignments", { load_id: hauled.id, driver_id: driver.id, vehicle_id: truck.id, version: hauled.version });
  for (const action of ["dispatch", "arrive", "depart", "arrive", "depart"]) hauled = await viaApp<Load>(page, "POST", `/loads/${hauled.id}/transitions`, { action, version: hauled.version });
  // And a second truck over the speed policy right now.
  const fast = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-77", ...PAPERS });
  const samples = [75, 76, 77, 76, 75, 76, 77].map((mph, i) => ({ vehicle_id: fast.id, recorded_at: at(-3 + i * 0.5), lat: 31.1 - i * 0.004, lon: -97.34, speed_mph: mph, heading: 180, accuracy_m: 5 }));
  await viaApp(page, "POST", "/positions", { samples });

  await open(page, account, "dashboard");
  const card = page.getByRole("region", { name: "Needs attention" });
  const speeding = card.locator(".attn", { hasText: "Above 73 mph for 3 min" });
  await expect(speeding).toContainText("Speeding");
  await expect(speeding).toContainText("T-77");
  await expect(speeding).toContainText("peak 77 mph · not acknowledged");
  const unassigned = card.locator(".attn", { hasText: waiting.load_number });
  await expect(unassigned).toContainText("Unassigned");
  await expect(unassigned).toContainText(/Pickup (today|tomorrow) with no driver/);
  await expect(unassigned).toContainText("Globex, Dallas · pickup");
  const pod = card.locator(".attn", { hasText: hauled.load_number });
  await expect(pod).toContainText("POD missing");
  await expect(pod).toContainText("Globex, Austin · invoicing blocked until received");
  await expect(page.locator(".kpi", { hasText: "Late or at risk" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live fleet" }).or(page.locator(".card", { hasText: "Live fleet" })).first()).toContainText("Speeding now");

  // Acknowledged in place: the row goes.
  await speeding.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByRole("status")).toContainText("T-77 acknowledged");
  await expect(card.locator(".attn", { hasText: "Above 73 mph" })).toHaveCount(0);

  // The driver isn't on the driver app, so the request isn't sent, and the dashboard says so.
  await pod.getByRole("button", { name: "Request POD" }).click();
  await expect(page.locator(".toastw")).toContainText("Dana Reyes isn’t on the driver app, so the request wasn’t sent");
  await expect(pod).toContainText("driver asked once");

  // Assign opens the board with that load in the assignment panel.
  await unassigned.getByRole("button", { name: "Assign" }).click();
  await expect(page).toHaveURL(/\/dispatch/);
});
