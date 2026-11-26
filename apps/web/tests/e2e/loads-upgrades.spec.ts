import { expect, test, type Page } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";

const SHOTS = process.env.LD_SHOTS;
type Load = { id: string; load_number: string; version: number };

async function setUp(page: Page) {
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Lakeside Foods", payment_terms_days: 30 });
  await viaApp(page, "POST", `/customers/${customer.id}/contacts`, { name: "Dock office", email: "dock@example.com" });
  const other = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Initech" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Avery", last_name: "Novak", driver_type: "company", status: "active", cdl_expiry: day(500), medical_cert_expiry: day(300) });
  await qualify(page, driver.id);
  const dates = { registration_expiry: day(300), insurance_expiry: day(300), inspection_expiry: day(300), ownership: "owned", status: "active" };
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "301", ...dates });
  const trailer = await viaApp<{ id: string }>(page, "POST", "/trailers", { unit_number: "8801", type: "dry_van", ...dates });
  // Picking up in five hours, so a load with no driver is at risk.
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const route = () => [
    { type: "pickup", city: "Joliet", state: "IL", appt_start: hours(5) },
    { type: "delivery", city: "Columbus", state: "OH", appt_start: hours(14) }];
  const make = (c: string, extra: Record<string, unknown> = {}) => viaApp<Load>(page, "POST", "/loads", { customer_id: c, customer_rate: "2000.00", miles: 500, fuel_surcharge_pct: "12", stops: route(), ...extra });
  return {
    customer, driver, truck, trailer,
    a: await make(customer.id, { pickup_number: "PU-7781" }),
    b: await make(other.id, { equipment_type: "reefer" }),
  };
}

test("loads upgrades: facets and search, board rules, row menu with undo, money and charges, tracking link, check calls", async ({ page, browser }) => {
  const account = await signUp(page);
  const s = await setUp(page);
  await open(page, account, "loads");
  const row = (l: Load) => page.locator(".trow", { hasText: l.load_number });

  // Search covers the pickup number; filters pick several values, each with its count.
  await page.getByLabel("Search loads").fill("PU-7781");
  await expect(row(s.a)).toBeVisible();
  await expect(row(s.b)).toHaveCount(0);
  await page.getByLabel("Search loads").fill("");
  await page.getByRole("button", { name: "Filter by customer" }).click();
  const customers = page.getByRole("listbox", { name: "Customer" });
  await expect(customers.getByRole("option", { name: /Lakeside Foods\s*1/ })).toBeVisible();
  await customers.getByRole("option", { name: /Initech/ }).click();
  await expect(row(s.a)).toHaveCount(0);
  await customers.getByRole("option", { name: /Lakeside Foods/ }).click();
  await expect(row(s.a)).toBeVisible();
  await expect(row(s.b)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Remove filter Customer/ }).click();

  // The risk column gives the label and the reason in words.
  await expect(row(s.a)).toContainText("No driver");
  await expect(row(s.a)).toContainText("no driver assigned");

  // Optional columns: margin for finance roles.
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("group", { name: "Columns" }).getByLabel("Margin").check();
  await page.locator(".ddcatch").click();
  await expect(row(s.a)).toContainText("$816.76");
  await expect(row(s.a)).toContainText("36%");

  // Row menu: duplicate as a draft, then Undo.
  await row(s.a).getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate as a draft" }).click();
  await expect(page.locator(".toastw")).toContainText(`created from ${s.a.load_number}`);
  await page.locator(".toastw").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".toastw")).toContainText("removed");
  await page.keyboard.press("Escape");

  // Board: a load without a driver can't go to Assigned, and the toast says why.
  await page.getByRole("group", { name: "Loads layout" }).getByRole("button", { name: "Board" }).click();
  const board = page.getByRole("list", { name: "Loads board" });
  const card = board.getByRole("button", { name: new RegExp(`^${s.a.load_number},`) });
  await expect(page.locator("[data-col=unassigned]")).toContainText(s.a.load_number);
  await card.focus();
  await page.keyboard.press("]");
  await expect(page.locator(".toastw")).toContainText(`${s.a.load_number} needs a driver first`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/loads-board.png` });
  // With a driver, Assigned → In transit dispatches it.
  await viaApp(page, "POST", "/dispatch/assignments", { load_id: s.a.id, driver_id: s.driver.id, vehicle_id: s.truck.id, trailer_id: s.trailer.id, version: (await viaApp<Load>(page, "GET", `/loads/${s.a.id}`)).version });
  await page.reload();
  await page.getByRole("group", { name: "Loads layout" }).getByRole("button", { name: "Board" }).click();
  await expect(page.locator("[data-col=assigned]")).toContainText(s.a.load_number);
  await board.getByRole("button", { name: new RegExp(`^${s.a.load_number},`) }).focus();
  await page.keyboard.press("]");
  await expect(page.locator(".toastw")).toContainText(`${s.a.load_number} moved to In transit`);
  await expect(page.locator("[data-col=in_transit]")).toContainText(s.a.load_number);
  // Back is refused once moving.
  await board.getByRole("button", { name: new RegExp(`^${s.a.load_number},`) }).focus();
  await page.keyboard.press("[");
  await expect(page.locator(".toastw")).toContainText("can’t go back once it is moving");

  // The drawer: money with fuel and margin, an extra charge waiting for approval.
  await board.getByRole("button", { name: new RegExp(`^${s.a.load_number},`) }).click();
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await drawer.getByRole("tab", { name: /Money/ }).click();
  const money = drawer.getByRole("region", { name: "Money" });
  await expect(money).toContainText("$240.00");
  await money.getByRole("group", { name: "Fuel surcharge percent" }).getByRole("button", { name: "15%" }).click();
  await expect(money).toContainText("$300.00");
  await money.getByRole("button", { name: "Add charge" }).click();
  await money.getByLabel("Charge type").selectOption("lumper");
  await money.getByLabel("Amount").fill("100");
  await money.getByLabel("Note").fill("Receipt from the dock");
  await money.getByRole("button", { name: "Add", exact: true }).click();
  await expect(money).toContainText("1 charge waiting · invoicing blocked");
  await money.getByRole("button", { name: "Approve" }).click();
  await expect(money).not.toContainText("charge waiting");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/loads-money.png` });

  // Tracking: a link the customer opens without signing in; off, it stops working.
  await drawer.getByRole("tab", { name: "Tracking" }).click();
  const link = drawer.getByRole("region", { name: "Tracking link" });
  await link.getByRole("button", { name: "Turn on" }).click();
  const url = await link.getByLabel("Tracking link").inputValue();
  expect(url).toMatch(/\/track\/[\w-]+$/);
  await link.getByRole("button", { name: "Send" }).click();
  await expect(link.getByLabel("Send to")).toHaveValue("dock@example.com");
  await link.getByRole("button", { name: "Send email" }).click();
  await expect(page.locator(".toastw")).toContainText("Tracking link sent to dock@example.com");
  const outsider = await browser.newPage();
  await outsider.goto(url);
  await expect(outsider.getByRole("heading", { name: `Load ${s.a.load_number}` })).toBeVisible();
  await expect(outsider.locator("body")).not.toContainText("$");
  await link.getByRole("button", { name: "Turn off" }).click();
  await expect(link).toContainText("Off");
  await outsider.reload();
  await expect(outsider.getByRole("heading", { name: "This tracking link isn’t active" })).toBeVisible();
  await outsider.close();

  // Check calls: log one, and set the reminder.
  const calls = drawer.getByRole("region", { name: "Check calls" });
  await calls.getByRole("group", { name: "Check-call reminder" }).getByRole("button", { name: "2 h" }).click();
  await expect(page.locator(".toastw")).toContainText("Reminder after 2 h");
  await calls.getByRole("button", { name: "Log check call" }).click();
  await calls.getByLabel("City").fill("Indianapolis");
  await calls.getByLabel("State").fill("IN");
  await calls.getByRole("button", { name: "Log", exact: true }).click();
  await expect(calls).toContainText("Indianapolis, IN");
  await expect(calls).toContainText("Last check call");

  // Activity: every change, in words.
  await drawer.getByRole("tab", { name: "Activity" }).click();
  const activity = drawer.getByRole("region", { name: "Activity" });
  await expect(activity).toContainText("logged a check call at Indianapolis, IN by phone");
  await expect(activity).toContainText("turned the tracking link off");
  await expect(activity).toContainText("approved the lumper charge");
});

test("new load: fuel/scale stop with handling, fuel %, live margin and a weekly repeat; saved as a draft until a rate confirmation", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/customers", { name: "Lakeside Foods", payment_terms_days: 30 });
  await open(page, account, "loads/new");
  await page.locator("#nl-c").selectOption({ label: "Lakeside Foods" });
  await page.locator("#nl-seal").fill("SL-55");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.locator("#nl-mi").fill("500");
  await page.getByRole("button", { name: /Continue to/ }).click();
  // A route must start with a pickup and end with a delivery.
  await page.getByRole("group", { name: "Stop 1 type" }).getByRole("button", { name: "Delivery" }).click();
  await page.locator("#nl-ci0").fill("Joliet");
  await page.locator("#nl-d0").fill(day(2));
  await page.locator("#nl-ci1").fill("Effingham");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await expect(page.getByText("Start with a pickup and end with a delivery.").first()).toBeVisible();
  await page.getByRole("group", { name: "Stop 1 type" }).getByRole("button", { name: "Pickup" }).click();
  // The middle stop is for fuel and the scale; the delivery is a drop.
  await page.getByRole("button", { name: /^Add stop/ }).click();
  await page.getByRole("group", { name: "Stop 2 type" }).getByRole("button", { name: "Fuel / scale" }).click();
  await page.locator("#nl-ci2").fill("Columbus");
  await page.locator("#nl-d2").fill(day(3));
  await page.getByRole("group", { name: "Stop 3 handling" }).getByRole("button", { name: "Drop" }).click();
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.locator("#nl-rate").fill("2000");
  await page.getByRole("group", { name: "Fuel surcharge percent" }).getByRole("button", { name: "12%" }).click();
  const margin = page.getByRole("region", { name: "Margin estimate" });
  await expect(margin).toContainText("$2,240.00");
  await expect(margin).toContainText("36% margin");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.getByRole("group", { name: "Repeat on" }).getByRole("button", { name: "Mon" }).click();
  await expect(page.getByText(/^Next: /)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/loads-new.png` });
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.getByRole("button", { name: "Book load" }).click();
  await expect(page.locator(".toastw")).toContainText("stays a draft until a rate confirmation is attached");
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await expect(drawer).toContainText("Draft");
  await drawer.getByRole("tab", { name: "Stops" }).click();
  const stops = drawer.getByRole("region", { name: "Stops" });
  await expect(stops).toContainText("Fuel / scale");
  await expect(stops.getByRole("button", { name: /Handling Drop/ })).toBeVisible();
});
