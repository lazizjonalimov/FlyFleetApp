import { expect, test, type Page } from "@playwright/test";
import { day, open, qualify, signUp, type Account, viaApp } from "./helpers";

/** A customer, a driver, a truck and a trailer: what a load needs to be booked and dispatched. */
async function fleet(page: Page) {
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Lakeside Foods", payment_terms_days: 30 });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Avery", last_name: "Novak", driver_type: "company", status: "active", pay_type: "per_mile", pay_rate: "0.60", cdl_expiry: day(500), medical_cert_expiry: day(300) });
  await qualify(page, driver.id);
  await viaApp(page, "POST", "/vehicles", { unit_number: "301", ownership: "owned", status: "active", registration_expiry: day(300), insurance_expiry: day(300), inspection_expiry: day(300) });
  await viaApp(page, "POST", "/trailers", { unit_number: "8801", type: "dry_van", ownership: "owned", status: "active", registration_expiry: day(300), insurance_expiry: day(300), inspection_expiry: day(300) });
  return { customer, driver };
}

async function book(page: Page, account: Account) {
  await open(page, account, "loads/new");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await expect(page.locator(".errt", { hasText: "Choose the customer" })).toBeVisible();
  await page.locator("#nl-c").selectOption({ label: "Lakeside Foods" });
  await page.locator("#nl-ref").fill("PO-2468");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.locator("#nl-mi").fill("410");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.locator("#nl-ci0").fill("Joliet");
  await page.locator("#nl-st0").fill("IL");
  await page.locator("#nl-d0").fill(day(2));
  await page.locator("#nl-a0").fill("08:00");
  await page.locator("#nl-b0").fill("10:00");
  await page.locator("#nl-ci1").fill("Columbus");
  await page.locator("#nl-st1").fill("OH");
  await page.locator("#nl-d1").fill(day(3));
  await page.locator("#nl-a1").fill("09:00");
  await page.getByRole("button", { name: /Continue to/ }).click();
  await page.locator("#nl-rate").fill("1650");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /Continue to/ }).click();
  await page.getByRole("button", { name: "Book load" }).click();
  await expect(page).toHaveURL(new RegExp(`/${account.slug}/loads/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "Joliet, IL → Columbus, OH", level: 1 })).toBeVisible();
}

test("booking a load through the guided form", async ({ page }) => {
  const account = await signUp(page);
  await fleet(page);
  await book(page, account);
  await expect(page.locator(".ph")).toContainText("Planned");
  await expect(page.locator(".ph")).toContainText("Lakeside Foods · PO-2468 · 410 mi");
  await expect(page.locator(".main")).toContainText("$1,650.00");
});

test("the list opens a load in the drawer; the address carries it; Back closes it", async ({ page }) => {
  const account = await signUp(page);
  await fleet(page);
  await book(page, account);
  await open(page, account, "loads");
  await page.locator(".trow", { hasText: "Lakeside Foods" }).click();
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await expect(drawer).toContainText("Joliet, IL → Columbus, OH");
  await expect(page).toHaveURL(/\/loads\?drawer=[0-9a-f-]{36}$/);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.goBack();
  await expect(drawer).toBeVisible();
});

test("dispatch: assigning from the board, then arriving at pickup", async ({ page }) => {
  const account = await signUp(page);
  await fleet(page);
  await book(page, account);
  await open(page, account, "dispatch");
  // Dragging the load onto a driver opens the assignment with that driver chosen; nothing is saved until confirmed.
  const card = page.locator(".qcard", { hasText: "Lakeside Foods" });
  await expect(card).toContainText(/Pickup in \d+h|Planned|Late pickup/);
  await card.dragTo(page.locator(".tlrow", { hasText: "Avery Novak" }));
  const panel = page.getByRole("complementary", { name: "Assign load" });
  await expect(panel).toContainText("Avery Novak");
  await expect(panel.locator("[aria-checked=true], .on, .sel").first()).toContainText("Avery Novak");
  await expect(panel).toContainText("301");
  await panel.getByRole("button", { name: "Assign & dispatch" }).click();
  await expect(page.getByRole("status")).toContainText("assigned and dispatched to Avery Novak");
  await expect(page.locator(".tlrow", { hasText: "Avery Novak" })).toBeVisible();

  await open(page, account, "loads");
  await page.locator(".trow", { hasText: "Lakeside Foods" }).click();
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await expect(drawer).toContainText("Dispatched");
  await drawer.getByRole("button", { name: "Update status" }).click();
  await page.getByRole("menuitem", { name: "Arrived at stop 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Record arrival" }).click();
  await expect(drawer).toContainText("At pickup");
});
