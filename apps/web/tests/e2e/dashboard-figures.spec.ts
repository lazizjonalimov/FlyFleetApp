import { expect, test, type Page } from "@playwright/test";
import { live, open, PASSWORD, signIn, signUp, unique, viaApp, type Account } from "./helpers";

/** A time zone where it's around midday now, so today's schedule has room either side. */
function middayZone(): string {
  const offset = 12 - new Date().getUTCHours();          // hours to add to UTC
  const clamped = Math.max(-12, Math.min(14, offset));
  return clamped === 0 ? "UTC" : `Etc/GMT${clamped > 0 ? "-" : "+"}${Math.abs(clamped)}`;   // Etc/GMT signs are inverted
}
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function withLoads(page: Page): Promise<Account> {
  const account = await signUp(page, "Acme Trucking");
  await viaApp(page, "PATCH", "/organization", { timezone: middayZone() });
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  for (const [pickup, delivery] of [[1, 3], [2, 5]]) {
    await viaApp(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "900.00", stops: [
      { type: "pickup", name: "Shipper", city: "Dallas", state: "TX", appt_start: inHours(pickup) },
      { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: inHours(delivery) },
    ] });
  }
  await open(page, account, "dashboard");
  return account;
}

test("figures by period, each opening the exact list behind it, and today's schedule", async ({ page }) => {
  await withLoads(page);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).or(page.locator(".crumb"))).toContainText("Dashboard");
  await expect(page.getByRole("group", { name: "Quick actions" }).getByRole("button")).toHaveText(["Assign a driver", "Create an invoice", "Add a driver", "Add a truck"]);

  // Six cards; each says what it counts and how it changed, never by colour alone.
  const unassigned = page.getByRole("button", { name: /^Unassigned loads: 2\./ });
  await expect(page.locator(".kpis .kpi")).toHaveCount(6);
  await expect(unassigned).toHaveAttribute("title", /^Unassigned loads: loads with a pickup in the next 24 hours/);
  await expect(unassigned.locator(".kchg")).toContainText("yesterday");
  await expect(unassigned.locator("svg")).toHaveAttribute("aria-hidden", "true");

  // The period changes what flow figures count, and what they're compared with.
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(page.getByRole("button", { name: "This week", exact: true })).toHaveAttribute("aria-pressed", "true");
  const week = page.getByRole("button", { name: /^Unassigned this week:/ });
  await expect(week.locator(".kchg")).toContainText("last week");
  await expect(page.getByRole("button", { name: /^Deliveries this week:/ })).toBeVisible();
  const shown = Number((await week.locator(".kv2 span").first().innerText()).replace(/\D/g, ""));
  // A card opens its drawer; the drawer opens the exact list behind the number.
  await week.click();
  await page.getByRole("complementary", { name: /^Unassigned this week details$/ }).getByRole("button", { name: "Open the full page" }).click();
  await page.waitForURL(/\/loads$/);
  await expect(page.getByRole("button", { name: "Remove filter From dashboard: Unassigned this week" })).toBeVisible();
  await expect(page.locator(".tab.on .tcnt")).toHaveText(String(shown));

  // Today's schedule: two lanes of chips; choosing one opens its load.
  await page.goBack();
  await live(page);
  const schedule = page.getByRole("region", { name: /Today’s schedule/ });
  await expect(schedule.getByRole("group", { name: "Pickups" }).getByRole("button")).toHaveCount(2);
  const chip = schedule.getByRole("button", { name: /^Pickup L-\d+ at \d\d:\d\d, No driver\. Open load\.$/ }).first();
  await expect(schedule.locator(".sr-only")).toContainText("4 pickups and deliveries still to go today");
  await chip.click();
  await page.waitForURL(/\/loads\/[0-9a-f-]{36}$/);
});

test("roles see their own figures; All companies totals them and opens a company from its row", async ({ page, browser }) => {
  const account = await withLoads(page);

  // Accounting: the invoice action only, billing figures, and no schedule.
  const email = `${unique("ana")}@example.com`;
  await viaApp(page, "POST", "/members", { email, full_name: "Ana Accounts", password: PASSWORD, role: "accountant" });
  const accountant = await browser.newPage();
  await signIn(accountant, email);
  await accountant.waitForURL(/\/dashboard$/);
  await live(accountant);
  await expect(accountant.getByRole("group", { name: "Quick actions" }).getByRole("button")).toHaveText(["Create an invoice"]);
  await expect(accountant.getByRole("button", { name: /^Ready to invoice:/ })).toBeVisible();
  await expect(accountant.getByRole("region", { name: /Today’s schedule/ })).toHaveCount(0);

  // A second company; All companies adds the figures up and lists each company.
  await viaApp(page, "POST", "/me/companies", { name: "Bravo Freight Lines", mc_number: String(Date.now()).slice(-6), home_state: "TX", fleet_size: "1-5", color: "#0891B2" });
  await page.goto("/all/dashboard");
  await live(page);
  await expect(page.getByRole("button", { name: /^Unassigned loads: 2\./ })).toContainText("across 2 companies");
  const rows = page.getByRole("region", { name: "By company" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: /^Bravo Freight Lines: 0 unassigned/ }).click();
  await expect(page.locator(".toastw")).toContainText("Switched to Bravo Freight Lines, same page");
  await page.waitForURL(/\/dashboard$/);
  expect(page.url()).not.toContain(account.slug);
});
