import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

test("maintenance: a repair waits for parts, is completed, and the truck is signed back into service", async ({ page }) => {
  const account = await signUp(page);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-1138", registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) });
  const wo = await viaApp<{ number: string }>(page, "POST", "/maintenance/work-orders", { vehicle_id: truck.id, title: "Turbo actuator replacement", priority: "high", out_of_service: true, vendor: "Gulf Coast Truck" });

  await open(page, account, "maintenance");
  await expect(page.locator(".kpi", { hasText: "Open work orders" })).toContainText("1 high priority");
  await expect(page.locator(".kpi", { hasText: "Out of service" })).toContainText("T-1138 since");
  const column = (name: string) => page.locator(".kcol", { has: page.locator(".kch", { hasText: name }) });
  const card = column("Open").locator(".wo", { hasText: wo.number });
  await expect(card).toContainText("High");
  await expect(card).toContainText("Reported by");

  // Waiting for parts, with the date they are due.
  await card.click();
  const dialog = page.getByRole("dialog", { name: new RegExp(wo.number) });
  await dialog.getByLabel("Parts due (if it waits for parts)").fill(day(4));
  await dialog.getByRole("button", { name: "Waiting for parts" }).click();
  await expect(page.locator(".toastw")).toContainText(`${wo.number} is waiting for parts`);
  const waiting = column("Waiting parts").locator(".wo", { hasText: wo.number });
  await expect(waiting).toContainText("Part ETA");
  await expect(waiting).toContainText("Out of service since");

  // The parts arrive; the repair is done; the truck still needs signing off.
  await waiting.click();
  await page.getByRole("dialog", { name: new RegExp(wo.number) }).getByRole("button", { name: "Parts are in" }).click();
  await column("In progress").locator(".wo", { hasText: wo.number }).click();
  await page.getByRole("dialog", { name: new RegExp(wo.number) }).getByRole("button", { name: "Complete" }).click();
  const completed = column("Completed").locator(".wo", { hasText: wo.number });
  await expect(completed).toContainText("Return-to-service check pending");
  await completed.getByRole("button", { name: "Sign off" }).click();
  await expect(page.locator(".toastw")).toContainText("Truck T-1138 is back in service");
  await expect(completed).toContainText("Returned to service by");

  // The same work order in the list and on the calendar.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(page.locator(".trow", { hasText: wo.number })).toContainText("Completed");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("button", { name: /T-1138 · Turbo actuator replacement/ })).toBeVisible();
});
