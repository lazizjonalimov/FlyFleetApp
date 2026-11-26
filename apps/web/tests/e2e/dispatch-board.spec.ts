import { expect, test, type Page } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";

const SHOTS = process.env.DB_SHOTS;
type Load = { id: string; load_number: string };
const label = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

async function setUp(page: Page) {
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Lakeside Foods", payment_terms_days: 30 });
  const avery = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Avery", last_name: "Novak", driver_type: "company", status: "active", cdl_expiry: day(500), medical_cert_expiry: day(300) });
  await qualify(page, avery.id);
  // Blake has no qualification file yet, so the board says why Blake can't take a load.
  await viaApp(page, "POST", "/drivers", { first_name: "Blake", last_name: "Ortiz", driver_type: "company", status: "active", cdl_expiry: day(500), medical_cert_expiry: day(300) });
  const dates = { registration_expiry: day(300), insurance_expiry: day(300), inspection_expiry: day(300), ownership: "owned", status: "active" };
  for (const unit of ["301", "302"]) await viaApp(page, "POST", "/vehicles", { unit_number: unit, ...dates });
  for (const unit of ["8801", "8802"]) await viaApp(page, "POST", "/trailers", { unit_number: unit, type: "dry_van", ...dates });
  const make = (d: string, from: string, to: string) => viaApp<Load>(page, "POST", "/loads", { customer_id: customer.id, customer_rate: "1500.00", miles: 300, stops: [
    { type: "pickup", city: "Joliet", state: "IL", appt_start: `${d}T${from}:00Z` },
    { type: "delivery", city: "Columbus", state: "OH", appt_start: `${d}T${to}:00Z` }] });
  const tomorrow = day(1);
  return {
    first: await make(tomorrow, "14:00", "19:00"),
    second: await make(tomorrow, "21:00", "23:30"),
    clash: await make(tomorrow, "15:00", "18:00"),
    later: await make(day(2), "15:00", "19:00"),
  };
}

test("dispatch board: place, drag, can't-reasons, best match with undo, reschedule, export and keys", async ({ page }) => {
  const account = await signUp(page);
  const loads = await setUp(page);
  await open(page, account, "dispatch");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Operations\s*Dispatch board/);
  await expect(page.locator(".sub")).toContainText("2 drivers on this board");
  await expect(page.locator(".sub")).toContainText("% of driving hours booked");

  // Keyboard: → moves a day, / finds, B / T switch views.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[aria-live=polite]").first()).toHaveText(label(day(1)));
  await page.keyboard.press("b");
  await expect(page.getByRole("group", { name: "Board layout" }).getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("t");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Find driver or load")).toBeFocused();
  await page.getByLabel("Find driver or load").press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  // Place: Blake can't (with the reason), Avery can; assign, undo, assign again.
  const queue = page.getByRole("region", { name: "Unassigned loads" });
  await queue.getByRole("button", { name: `Place ${loads.first.load_number} on a driver` }).click();
  await expect(page.getByText(`Placing ${loads.first.load_number} · Joliet → Columbus. Choose a driver below.`)).toBeVisible();
  const blake = page.locator(".tlrow", { hasText: "Blake Ortiz" });
  await expect(blake).toContainText("Can’t");
  await page.getByRole("button", { name: `Assign ${loads.first.load_number} here, to Avery Novak` }).click();
  await expect(page.locator(".toastw")).toContainText(`${loads.first.load_number} assigned to Avery Novak · driver notified`);
  await page.locator(".toastw").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".toastw")).toContainText(`${loads.first.load_number} is back in the queue`);
  await queue.getByRole("button", { name: `Place ${loads.first.load_number} on a driver` }).click();
  await page.getByRole("button", { name: `Assign ${loads.first.load_number} here, to Avery Novak` }).click();
  await expect(page.locator(".tlrow", { hasText: "Avery Novak" }).getByRole("button", { name: new RegExp(`^${loads.first.load_number},`) })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-timeline.png` });

  // Dragging a load onto a driver who's busy then: the toast says why not.
  await queue.locator(".qcard", { hasText: loads.clash.load_number }).dragTo(page.locator(".tlrow", { hasText: "Avery Novak" }));
  await expect(page.locator(".toastw")).toContainText(`Avery Novak can’t take ${loads.clash.load_number}`);

  // Table: best match for two loads; one can't be placed; Undo puts them back.
  await page.getByRole("group", { name: "Board layout" }).getByRole("button", { name: "Table" }).click();
  const table = page.getByRole("region", { name: `All loads on ${label(day(1))}` });
  await table.getByLabel(`Select ${loads.second.load_number}`).check();
  await table.getByLabel(`Select ${loads.clash.load_number}`).check();
  await expect(table.getByRole("group", { name: "Bulk actions" })).toContainText("2 selected");
  await table.getByRole("button", { name: "Assign 2 to best match" }).click();
  await expect(page.locator(".toastw")).toContainText("1 load assigned to best-match drivers · 1 had no eligible driver");
  await page.locator(".toastw").getByRole("button", { name: "Undo" }).click();
  await expect(table.locator(".trow", { hasText: loads.second.load_number })).toContainText("Unassigned");
  await table.getByRole("button", { name: "Sort by Driver" }).click();
  await expect(table.getByRole("button", { name: "Sort by Driver, ascending" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-table.png` });

  // Calendar: drag a load to the day before, then undo.
  await page.keyboard.press("c");
  await page.getByRole("group", { name: "Calendar range" }).getByRole("button", { name: "Month" }).click();
  const card = page.getByRole("button", { name: new RegExp(`^${loads.later.load_number},`) });
  const target = page.locator(".dbcal-cell", { has: page.getByRole("button", { name: new RegExp(`^${label(day(1))}`) }) });
  await card.dragTo(target);
  await expect(page.locator(".toastw")).toContainText(`${loads.later.load_number} moved to ${label(day(1))}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/board-calendar.png` });
  await page.locator(".toastw").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".toastw")).toContainText(`${loads.later.load_number} moved back to ${label(day(2))}`);

  // Export: the menu says it's open, and the CSV downloads.
  await page.keyboard.press("t");
  const exportButton = page.getByRole("button", { name: "Export" });
  await exportButton.click();
  await expect(exportButton).toHaveAttribute("aria-expanded", "true");
  const download = page.waitForEvent("download");
  await page.getByRole("group", { name: "Export options" }).getByRole("button", { name: "Download loads as CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^flyfleet-loads-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.locator(".toastw")).toContainText("Loads exported as CSV");

  // N goes back to today; the status chips are toggle filters.
  await page.keyboard.press("n");
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
  const chip = page.getByRole("group", { name: "Show loads by status" }).getByRole("button", { name: /^Unassigned/ });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});
