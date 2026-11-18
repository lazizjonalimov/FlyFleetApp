import { expect, test } from "@playwright/test";
import { day, live, open, qualify, signIn, signUp, unique, viaApp } from "./helpers";

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
type Load = { id: string; load_number: string; version: number };

test("shipment portal: a customer is given access, sees its shipment on the road, and writes to dispatch", async ({ page, browser }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Dana", last_name: "Reyes", cdl_number: "D1234567", cdl_state: "TX", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  await qualify(page, driver.id);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-55", registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) });
  let load = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "1500.00", reference: "PO 71904", stops: [
    { type: "pickup", name: "Globex DC", city: "Dallas", state: "TX", appt_start: at(-240) },
    { type: "delivery", name: "Globex Store 12", city: "Austin", state: "TX", appt_start: at(180) },
  ] });
  load = await viaApp<Load>(page, "POST", "/dispatch/assignments", { load_id: load.id, driver_id: driver.id, vehicle_id: truck.id, version: load.version });
  for (const action of ["dispatch", "arrive", "depart"]) load = await viaApp<Load>(page, "POST", `/loads/${load.id}/transitions`, { action, version: load.version });

  // Access from the customer's row.
  await open(page, account, "customers");
  await page.locator(".trow", { hasText: "Globex" }).getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Shipment portal access" }).click();
  const dialog = page.getByRole("dialog", { name: "Shipment portal · Globex" });
  const email = `${unique("kelly")}@globex.example`;
  await dialog.getByLabel("Name").fill("Kelly Moss");
  await dialog.getByLabel("Work email").fill(email);
  await dialog.getByLabel("Temporary password").fill("a long temporary pass");
  await dialog.getByRole("button", { name: "Give access" }).click();
  await expect(page.locator(".toastw")).toContainText("Kelly Moss can sign in to the shipment portal");
  await expect(dialog).toContainText(email);

  // The customer sees its shipment, where it is in the trip, and nothing about rates or the driver.
  const kelly = await (await browser.newContext()).newPage();
  await signIn(kelly, email, "a long temporary pass");
  await kelly.waitForURL(/\/portal$/);
  await live(kelly);
  const card = kelly.locator(".pship", { hasText: load.load_number });
  await expect(card).toContainText("PO 71904");
  await expect(card).toContainText("In transit");
  await expect(kelly.locator(".portal")).toContainText("Dallas, TX → Austin, TX");
  await expect(kelly.locator(".lcs.cur")).toContainText("In transit");
  await expect(kelly.locator(".portal")).toContainText("Rates and driver details aren’t shared");
  await expect(kelly.locator(".portal")).not.toContainText("Dana Reyes");
  await expect(kelly.locator(".portal")).not.toContainText("1,500");

  // Writing to dispatch reaches the carrier's Messages.
  await kelly.getByRole("button", { name: "Contact dispatch" }).click();
  const write = kelly.getByRole("dialog", { name: /Contact .* dispatch/ });
  await write.getByLabel("Message").fill("Can you confirm the delivery time?");
  await write.getByRole("button", { name: "Send" }).click();
  await expect(write).toContainText("Can you confirm the delivery time?");
  await open(page, account, "messages");
  await expect(page.locator(".main")).toContainText("Can you confirm the delivery time?");
});
