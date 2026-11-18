import { expect, type Page, test } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";
import { textPdf } from "./pdf";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
type Load = { id: string; load_number: string; version: number; status: string };

/** A load hauled to its delivery: the proof of delivery still to come. */
async function delivered(page: Page, customer: string, driver: string, truck: string, rate: string): Promise<Load> {
  const stops = [
    { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: at(-600) },
    { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: at(-120) },
  ];
  let load = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer, commodity: "Paper", customer_rate: rate, stops });
  load = await viaApp<Load>(page, "POST", "/dispatch/assignments", { load_id: load.id, driver_id: driver, vehicle_id: truck, version: load.version });
  for (const action of ["dispatch", "arrive", "depart", "arrive", "depart"]) load = await viaApp<Load>(page, "POST", `/loads/${load.id}/transitions`, { action, version: load.version });
  return load;
}

/** Delivered, its POD uploaded and approved: ready to invoice. */
async function completed(page: Page, customer: string, driver: string, truck: string, rate: string): Promise<Load> {
  const load = await delivered(page, customer, driver, truck, rate);
  const pdf = [...textPdf([[[40, 740, "PROOF OF DELIVERY"], [40, 700, `Load ${load.load_number}`]]])];
  await page.evaluate(
    async ({ id, bytes }) => {
      const body = new Uint8Array(bytes);
      const intent = await (await fetch("/api/v1/documents/upload-intents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "pod.pdf", content_type: "application/pdf", size_bytes: body.length, type: "pod", entity_type: "load", entity_id: id }) })).json();
      const target = intent.upload.url.startsWith("/") ? `/api/v1${intent.upload.url}` : intent.upload.url;
      await fetch(target, { method: intent.upload.method, headers: intent.upload.headers, body });
      await fetch(`/api/v1/documents/${intent.document.id}/complete`, { method: "POST" });
    },
    { id: load.id, bytes: pdf },
  );
  const now = await viaApp<Load>(page, "GET", `/loads/${load.id}`);
  return viaApp<Load>(page, "POST", `/loads/${load.id}/transitions`, { action: "approve_pod", version: now.version });
}

test("invoices: the month so far, delivered loads invoiced together, issued and voided from the row", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Dana", last_name: "Reyes", cdl_number: "D1234567", cdl_state: "TX", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  await qualify(page, driver.id);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-55", ...PAPERS });
  const billed = await completed(page, customer.id, driver.id, truck.id, "1200.00");
  const first = await completed(page, customer.id, driver.id, truck.id, "800.00");
  const second = await completed(page, customer.id, driver.id, truck.id, "500.00");
  await delivered(page, customer.id, driver.id, truck.id, "900.00");
  const draft = await viaApp<{ id: string }>(page, "POST", "/invoices", { customer_id: customer.id, load_ids: [billed.id] });
  const issued = await viaApp<{ id: string; invoice_number: string }>(page, "POST", `/invoices/${draft.id}/issue`);
  await viaApp(page, "POST", "/payments", { customer_id: customer.id, amount: "200.00", received_on: day(0), method: "ach", allocations: [{ invoice_id: issued.id, amount: "200.00" }] });

  // The month so far, and what is delivered but not yet billed.
  await open(page, account, "finance/invoices");
  await expect(page.locator(".kpi", { hasText: "Invoiced ·" })).toContainText("$1,200");
  await expect(page.locator(".kpi", { hasText: "Invoiced ·" })).toContainText("1 invoice issued");
  await expect(page.locator(".kpi", { hasText: "Cash received ·" })).toContainText("$200");
  await expect(page.locator(".kpi", { hasText: "Cash received ·" })).toContainText("1 payment applied");
  const unbilled = page.locator(".kpi", { hasText: "Delivered, not invoiced" });
  await expect(unbilled).toContainText("$2,200");
  await expect(unbilled).toContainText("Estimate · 2 loads ready, 1 blocked");
  const row = page.locator(".trow", { hasText: issued.invoice_number });
  await expect(row).toContainText("Partially paid");
  await expect(row).toContainText("$1,000.00");
  await expect(row).toContainText(/Due in \d+ days/);

  // Both ready loads on one draft, issued from its row.
  await page.getByRole("button", { name: /^Ready to invoice/ }).click();
  for (const load of [first, second]) await page.locator(".trow", { hasText: load.load_number }).getByRole("button", { name: "Select row" }).click();
  await page.getByRole("button", { name: "Create invoices" }).click();
  await expect(page.locator(".toastw")).toContainText("Draft invoice created for Globex · 2 loads");
  const drafted = page.locator(".trow", { hasText: "Globex" });
  await expect(drafted).toContainText("Ready to issue");
  await expect(drafted).toContainText("$1,300.00");
  await drafted.getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Issue invoice" }).click();
  await expect(page.locator(".toastw")).toContainText("issued to Globex");

  // Voided from its row, with the reason it was voided.
  await page.getByRole("button", { name: /^All open/ }).click();
  const fresh = page.locator(".trow", { hasText: "$1,300.00" });
  await expect(fresh).toContainText("Issued");
  await fresh.getByRole("button", { name: "Row actions" }).click();
  await page.getByRole("menuitem", { name: "Void invoice" }).click();
  const confirm = page.getByRole("dialog", { name: /^Void INV-/ });
  await confirm.getByLabel("Reason").fill("Wrong rate");
  await confirm.getByRole("button", { name: "Void invoice" }).click();
  await expect(page.locator(".toastw")).toContainText("voided");
  await page.getByRole("button", { name: /^Void/ }).click();
  await expect(page.locator(".trow", { hasText: "$1,300.00" })).toContainText("Voided: Wrong rate");
});
