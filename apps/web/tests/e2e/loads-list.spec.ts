import { expect, test } from "@playwright/test";
import { open, signUp, viaApp } from "./helpers";

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const route = (pickup: string, delivery: string) => [
  { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: pickup },
  { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: delivery },
];
type Load = { id: string; load_number: string };

test("loads list: each row's papers and risk, status changed in bulk, a saved view, loads from a spreadsheet", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const draft = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, status: "draft", commodity: "Paper", stops: route(at(48), at(72)) });
  const planned = await viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "1850.00", miles: 240, stops: route(at(50), at(74)) });

  await open(page, account, "loads");
  const row = (load: Load) => page.locator(".trow", { hasText: load.load_number });
  await expect(row(draft)).toContainText("No rate confirmation");
  await expect(row(draft)).toContainText("0/3");
  await expect(row(planned)).toContainText("$1,850");
  await expect(row(planned)).toContainText("$7.71/mi");
  await expect(page.locator(".tfoot")).toContainText("Showing 1–2 of 2");
  await expect(page.getByRole("button", { name: "Rows per page: 10" })).toBeVisible();

  // Mark ready in bulk: only the draft can be, and the result says why the other wasn't.
  await row(draft).locator(".chk").click();
  await row(planned).locator(".chk").click();
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog", { name: "Change status" });
  await expect(dialog.getByRole("radio", { name: /Mark ready/ })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Mark ready · 1 load" }).click();
  const done = page.getByRole("dialog", { name: "1 load marked ready" });
  await expect(done).toContainText(`${planned.load_number}not changed: is planned`);
  await done.getByRole("button", { name: "Done" }).click();
  await expect(row(draft)).toContainText("Planned");

  // A saved view: the filters kept under a name, back in one click.
  await page.getByRole("button", { name: "Filter by pickup" }).click();
  await page.getByRole("option", { name: /^Next week|^This week|^This month/ }).first().click();
  await page.getByRole("button", { name: "Save view" }).click();
  const save = page.getByRole("dialog", { name: "Save view" });
  await save.getByLabel("Name").fill("Coming up");
  await save.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("status")).toContainText("View “Coming up” saved");
  const view = page.locator(".tabs").getByRole("button", { name: "Coming up", exact: true });
  await expect(view).toHaveClass(/on/);
  await page.getByRole("button", { name: /^Remove filter Pickup/ }).click();
  await expect(view).not.toHaveClass(/on/);
  await view.click();
  await expect(page.getByRole("button", { name: /^Remove filter Pickup/ })).toBeVisible();
  await page.getByRole("button", { name: "Remove view Coming up" }).click();
  await expect(page.locator(".tabs").getByRole("button", { name: "Coming up", exact: true })).toHaveCount(0);

  // Loads from a spreadsheet, as drafts; a customer FlyFleet doesn't know is added.
  const csv = "Customer,PO #,Origin City,Origin State,Pickup Date,Dest City,Dest State,Delivery Date,Rate\nGlobex,PO-41,Memphis,TN,03/12/2031,Atlanta,GA,03/13/2031,1200\nInitech,PO-42,Dallas,TX,03/12/2031,Houston,TX,03/13/2031,900\n";
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const imp = page.getByRole("dialog", { name: "Import loads" });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), imp.getByRole("button", { name: "Choose a file" }).click()]);
  await chooser.setFiles({ name: "loads.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(imp).toContainText("9 of 9 columns matched");
  await imp.getByRole("button", { name: "Check 2 rows" }).click();
  await expect(imp).toContainText("“Initech” isn't a customer yet");
  await expect(imp.getByRole("button", { name: "Add customer" })).toHaveAttribute("aria-pressed", "true");
  await imp.getByRole("button", { name: /^Import 2 loads|^Import 1 load/ }).click();
  await expect(imp).toContainText("2 loads imported");
  await expect(imp).toContainText("New customers1");
  await imp.getByRole("button", { name: "Open loads" }).click();
  await expect(page.locator(".trow", { hasText: "Initech" })).toContainText("Draft");

  // Bills of lading for the selection, as a PDF in a new tab.
  await row(planned).locator(".chk").click();
  const [response] = await Promise.all([
    page.context().waitForEvent("response", (r) => r.url().includes("/api/v1/loads/bols.pdf?ids=")),
    page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Print BOLs" }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
});
