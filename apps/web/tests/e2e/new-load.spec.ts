import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

test("new load: a saved facility picked for a stop, miles estimated, the reference checked", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  await viaApp(page, "POST", `/customers/${customer.id}/addresses`, { label: "Globex Plant 2", kind: "facility", address: "1100 Ferris Rd", city: "Dallas", state: "TX", postal_code: "75201" });
  await viaApp(page, "POST", "/loads", { customer_id: customer.id, reference: "PO-1", commodity: "Paper", stops: [
    { type: "pickup", city: "Dallas", state: "TX", appt_start: new Date(Date.now() + 86_400_000).toISOString() },
    { type: "delivery", city: "Austin", state: "TX", appt_start: new Date(Date.now() + 2 * 86_400_000).toISOString() }] });

  await open(page, account, "loads/new");
  await page.locator("#nl-c").selectOption({ label: "Globex" });
  const checks = page.locator(".card", { hasText: "Check before saving" });
  await page.locator("#nl-ref").fill("PO-1");
  await expect(checks).toContainText("Reference PO-1 is already on L-1001");
  await page.locator("#nl-ref").fill("PO-2");
  await expect(checks).toContainText("Reference PO-2 is unique for Globex");
  await expect(checks).toContainText("Customer is active");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /Continue to/ }).click();

  // The facility search fills the stop from the customer's saved facility.
  await page.locator("#nl-f0").fill("plant");
  await page.getByRole("option", { name: /Globex Plant 2/ }).click();
  await expect(page.locator("#nl-ci0")).toHaveValue("Dallas");
  await expect(page.locator("#nl-st0")).toHaveValue("TX");
  await expect(page.locator("#nl-zip0")).toHaveValue("75201");
  await expect(page.locator(".fld", { has: page.locator("#nl-f0") })).toContainText("Saved facility");
  await page.locator("#nl-d0").fill(day(2));
  // The delivery's distance from the pickup, and the route's in the summary.
  await page.locator("#nl-ci1").fill("Austin");
  await page.locator("#nl-st1").fill("TX");
  await expect(page.locator(".fld", { has: page.locator("#nl-f1") })).toContainText(/\d+ mi from stop 1 \(estimate\)/);
  await expect(page.locator(".kv").first()).toContainText(/Est\. distance\d+ mi/);
  // A stop folded away shows a line instead of its fields.
  await page.getByRole("button", { name: "Fold stop 1" }).click();
  await expect(page.locator(".stopc").first()).toContainText("Globex Plant 2 · Dallas, TX");
  await expect(page.locator("#nl-ci0")).toBeHidden();
});
