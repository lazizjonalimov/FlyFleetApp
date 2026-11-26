import { expect, test } from "@playwright/test";
import { live, open, PASSWORD, signIn, signUp, unique, viaApp } from "./helpers";

const SHOTS = process.env.DX_SHOTS;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

test("dashboard command center: tabs, the day, the brief, drawers, calendar, customize, share and reports", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const load = await viaApp<{ load_number: string }>(page, "POST", "/loads", {
    customer_id: customer.id, customer_rate: "1800.00", miles: 200, stops: [
      { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: inHours(3) },
      { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: inHours(30) }] });
  await open(page, account, "dashboard");

  // Tabs under the header; the active one is the current page.
  const tabs = page.getByRole("navigation", { name: "Dashboard tabs" });
  await expect(tabs.getByRole("button")).toHaveText(["Overview", "Operations", "Financial", "Fleet & drivers", "Calendar"]);
  await expect(tabs.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  const header = page.locator(".ph").first();
  await expect(header.getByRole("button")).toContainText(["Today", "This week", "This month", "Customize", "Share", "New load"]);

  // The day at a glance, with its shortcuts and score.
  const day = page.getByRole("region", { name: "Your day at a glance" });
  await expect(day).toContainText("Good");
  await expect(day.getByRole("button", { name: "1 unassigned" })).toBeVisible();
  await expect(day.getByRole("img", { name: /^Operations score/ })).toBeVisible();
  await day.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator(".toastw")).toContainText("Dashboard updated at");

  // Today's brief: closed, then open; a dismissed item stays dismissed.
  const brief = page.getByRole("button", { name: /Today’s brief/ });
  await expect(brief).toHaveAttribute("aria-expanded", "false");
  await brief.click();
  await expect(brief).toHaveAttribute("aria-expanded", "true");
  const item = page.getByRole("button", { name: `Dismiss: Assign a driver to ${load.load_number}` });
  await expect(item).toBeVisible();
  await item.click();
  await expect(item).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dx-overview.png` });

  // A figure opens its drawer; Escape closes it and gives focus back.
  const card = page.getByRole("button", { name: /^Unassigned loads: 1\./ });
  await card.click();
  const drawer = page.getByRole("complementary", { name: "Unassigned loads details" });
  await expect(drawer).toContainText("7-day average");
  await expect(drawer.getByRole("button", { name: "Open the full page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(card).toBeFocused();

  // Operations: live status tiles, the map (no positions yet), and the cards with their reports.
  await tabs.getByRole("button", { name: "Operations" }).click();
  await expect(tabs.getByRole("button", { name: "Operations" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("group", { name: "Live status" }).getByRole("button", { name: /^Unassigned: 1\./ })).toBeVisible();
  await expect(page.getByText("No truck has sent a position yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open report: On-time delivery" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pickup heatmap" })).toContainText("When pickups happen");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dx-operations.png`, fullPage: true });

  // Financial: tiles, the range switch and the compare toggle.
  await tabs.getByRole("button", { name: "Financial" }).click();
  await expect(page.getByRole("group", { name: "Money figures" })).toContainText("Operating ratio");
  await page.getByRole("group", { name: "Weeks shown" }).getByRole("button", { name: "4 weeks" }).click();
  await expect(page.getByRole("group", { name: "Weeks shown" }).getByRole("button", { name: "4 weeks" })).toHaveAttribute("aria-pressed", "true");
  const compare = page.getByRole("button", { name: "Compare to previous period" });
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Lane profitability" })).toContainText("No loads delivered in the last 90 days.");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dx-financial.png`, fullPage: true });

  // Fleet & drivers.
  await tabs.getByRole("button", { name: "Fleet & drivers" }).click();
  await expect(page.getByRole("group", { name: "Fleet figures" })).toContainText("Average MPG");
  await expect(page.getByRole("region", { name: "Driver leaderboard" })).toContainText("No driver delivered a load in the last 30 days.");

  // Calendar: the pickup is there; filters say whether they're on; the event opens its drawer.
  await tabs.getByRole("button", { name: "Calendar" }).click();
  const filters = page.getByRole("group", { name: "Show categories" });
  await expect(filters.getByRole("button", { name: /^Pickups/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "Agenda" }).click();
  const ev = page.getByRole("button", { name: new RegExp(`^Pickup · ${load.load_number}`) });
  await ev.click();
  const evDrawer = page.getByRole("complementary", { name: new RegExp(`Pickup · ${load.load_number}`) });
  await expect(evDrawer).toContainText("Dallas, TX → Austin, TX");
  await expect(evDrawer.getByRole("button", { name: "Open load" })).toBeVisible();
  await evDrawer.getByRole("button", { name: "Close", exact: true }).first().click();
  await filters.getByRole("button", { name: /^Pickups/ }).click();
  await expect(filters.getByRole("button", { name: /^Pickups/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: new RegExp(`^Pickup · ${load.load_number}`) })).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dx-calendar.png` });

  // Customize: hide the Fleet & drivers tab and open on Calendar, saved for this person.
  await page.getByRole("button", { name: "Customize" }).click();
  const customize = page.getByRole("dialog", { name: "Customize the dashboard" });
  await customize.getByRole("button", { name: "Fleet & drivers" }).click();
  await customize.getByLabel("Open on").selectOption("calendar");
  await customize.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".toastw")).toContainText("Dashboard layout saved");
  await expect(tabs.getByRole("button", { name: "Fleet & drivers" })).toHaveCount(0);

  // Share: send now.
  await page.getByRole("button", { name: "Share" }).click();
  const share = page.getByRole("dialog", { name: "Share the dashboard" });
  await share.getByRole("button", { name: "Weekly" }).click();
  await share.getByLabel("Send time").selectOption("06:30");
  await expect(share).toContainText("Every Monday at 06:30, you get");
  await share.getByRole("button", { name: "Send now" }).click();
  await expect(page.locator(".toastw")).toContainText("Dashboard sent to Olive Owner");

  // A report from its card, and back to the dashboard.
  await tabs.getByRole("button", { name: "Operations" }).click();
  await page.getByRole("button", { name: "Open report: Longest dwell" }).click();
  await page.waitForURL(/\/reports/);
  await expect(page.getByRole("heading", { name: "Dwell and pickup demand" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Report catalog" })).toContainText("Fleet & drivers");
  await page.getByRole("button", { name: "See it on the dashboard" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("navigation", { name: "Dashboard tabs" }).getByRole("button", { name: "Operations" })).toHaveAttribute("aria-current", "page");
});

test("accounting gets Overview, Financial and Calendar; a dispatcher doesn't get Financial", async ({ page, browser }) => {
  await signUp(page);
  for (const [role, expected] of [["accountant", ["Overview", "Financial", "Calendar"]], ["dispatcher", ["Overview", "Operations", "Fleet & drivers", "Calendar"]]] as const) {
    const email = `${unique(role)}@example.com`;
    await viaApp(page, "POST", "/members", { email, full_name: `Pat ${role}`, password: PASSWORD, role });
    const other = await browser.newPage();
    await signIn(other, email);
    await other.waitForURL(/\/dashboard$/);
    await live(other);
    await expect(other.getByRole("navigation", { name: "Dashboard tabs" }).getByRole("button")).toHaveText([...expected]);
    if (role === "dispatcher") {
      await other.goto(other.url().replace(/\/dashboard$/, "/reports"));
      await live(other);
      await expect(other.getByRole("navigation", { name: "Report catalog" }).getByRole("button", { name: "Lane profitability" })).toBeDisabled();
    }
    await other.close();
  }
});
