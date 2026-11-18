import { expect, test } from "@playwright/test";
import { day, open, PASSWORD, qualify, signIn, signUp, unique, viaApp } from "./helpers";

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const route = (pickup: string, delivery: string) => [
  { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: pickup },
  { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: delivery },
];
type Load = { id: string; load_number: string; version: number };

test("a load's drawer and page: the POD asked for, rates asked for, and a stop added", async ({ page, browser }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Dana", last_name: "Reyes", phone: "469-555-0103", cdl_number: "D1234567", cdl_state: "TX", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  await qualify(page, driver.id);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-55", registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) });
  let hauled = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "1900.00", stops: route(at(-10), at(-2)) });
  hauled = await viaApp<Load>(page, "POST", "/dispatch/assignments", { load_id: hauled.id, driver_id: driver.id, vehicle_id: truck.id, version: hauled.version });
  for (const action of ["dispatch", "arrive", "depart", "arrive", "depart"]) hauled = await viaApp<Load>(page, "POST", `/loads/${hauled.id}/transitions`, { action, version: hauled.version });
  const planned = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "1200.00", stops: route(at(48), at(72)) });

  // The drawer: the POD is missing; asking the driver, who isn't on the app, says so and is remembered.
  await open(page, account, `loads?drawer=${hauled.id}`);
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await expect(drawer).toContainText("POD missing");
  await expect(drawer).toContainText("Proof of delivery missing");
  await expect(drawer).toContainText("469-555-0103");
  await expect(drawer).toContainText("No position yet");
  await drawer.getByRole("button", { name: "Request POD" }).click();
  await expect(page.locator(".toastw")).toContainText("Dana Reyes isn’t on the driver app, so the request wasn’t sent");
  await expect(drawer).toContainText("The driver was asked in the app at");
  await drawer.getByRole("button", { name: "More" }).click();
  await expect(drawer.getByRole("menuitem", { name: "Print BOL" })).toBeVisible();
  await drawer.getByRole("menuitem", { name: "Copy link" }).press("Escape");

  // A stop added on the full page, before the delivery.
  await open(page, account, `loads/${planned.id}`);
  await page.getByRole("button", { name: "Add stop" }).click();
  const add = page.getByRole("dialog", { name: "Add stop" });
  await add.getByRole("radio", { name: "Delivery" }).click();
  await add.getByLabel("Name").fill("Waco Cross-dock");
  await add.getByLabel("City").fill("Waco");
  await add.getByLabel("State").selectOption("TX");
  await add.getByRole("button", { name: "Add stop" }).click();
  await expect(page.getByRole("status")).toContainText(`Delivery added to ${planned.load_number}`);
  await expect(page.locator(".trow", { hasText: "Waco Cross-dock" })).toContainText("Delivery · Waco, TX");

  // A dispatcher can't see rates; asking for them gives the Main Admin a task.
  const email = `${unique("disp")}@example.com`;
  await viaApp(page, "POST", "/members", { email, full_name: "Jordan Lee", role: "dispatcher", password: PASSWORD });
  const other = await (await browser.newContext()).newPage();
  await signIn(other, email);
  await other.waitForURL(/\/dashboard$/);
  await other.goto(`/${account.slug}/loads?drawer=${planned.id}`);
  const theirs = other.getByRole("complementary", { name: "Load details" });
  await expect(theirs).toContainText("Financials are restricted");
  await expect(theirs).toContainText("Your role (Dispatcher) can’t view rates, pay or margins");
  await theirs.getByRole("button", { name: "Request access" }).click();
  await expect(other.getByRole("status")).toContainText("Asked Olive Owner for access to rates");
  await other.close();
  await open(page, account, "tasks");
  await expect(page.locator(".trow", { hasText: "Jordan Lee asks to see customer rates and charges" })).toContainText(`Asked from load ${planned.load_number}`);
});
