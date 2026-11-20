import { expect, test } from "@playwright/test";
import { live, nav, open, signIn, signUp, unique, viaApp } from "./helpers";

test("a member added with a role sees only what the role allows", async ({ page, browser }) => {
  const account = await signUp(page);
  await open(page, account, "settings/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByRole("dialog", { name: "Invite member" }).getByRole("button", { name: "Set a temporary password instead" }).click();
  const dialog = page.getByRole("dialog", { name: "Add member" });
  const email = `${unique("safety")}@example.com`;
  await dialog.getByLabel("Name *").fill("Sid Safety");
  await dialog.getByLabel("Work email *").fill(email);
  await dialog.getByLabel("Role *").selectOption("safety_manager");
  await dialog.getByLabel("Temporary password").fill("a long temporary pass");
  await dialog.getByRole("button", { name: "Add member" }).click();
  await expect(page.locator(".tbody")).toContainText("Sid Safety");

  const other = await (await browser.newContext()).newPage();
  await signIn(other, email, "a long temporary pass");
  await other.waitForURL(/\/dashboard$/);
  await live(other);
  await expect(other.getByRole("button", { name: "Account menu" })).toContainText("Safety Manager");
  await expect(nav(other, "Invoices")).toHaveAttribute("aria-label", /no access/);
  await open(other, account, "finance/invoices");
  await expect(other.locator(".main")).toContainText("You don’t have access to Invoices");
  // Asking for it reaches the people who manage the team; asking again says they were already asked.
  await other.getByRole("button", { name: "Request access" }).click();
  await expect(other.locator(".toastw")).toContainText("for access to Invoices");

  // The assistant reads what the role can see, says what it can't, and says plainly when it isn't connected.
  await other.getByRole("button", { name: /Ask FlyFleet/ }).first().click();
  const assistant = other.getByRole("complementary", { name: "Ask FlyFleet" });
  await expect(assistant).toContainText("Using: Loads");
  await expect(assistant).toContainText("Hidden for your role: Finance, Rates");
  await expect(assistant).toContainText("Ask FlyFleet isn’t connected");
  await expect(assistant.getByRole("textbox", { name: "Ask FlyFleet" })).toBeDisabled();
});

test("company settings are saved", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "settings/integrations");
  await expect(page.locator(".icard", { hasText: "Loads, messages, alerts and phone GPS" })).toContainText("Connected");
  await expect(page.locator(".icard", { hasText: "Driver alerts and messaging" })).toContainText("Not connected");
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByLabel("MC number").fill("MC-445566");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Company settings saved");
  await expect(page.getByRole("button", { name: "Switch company" })).toContainText("MC-445566");
});

test("your own account: your name, the keyboard shortcuts, and what the bell tells you", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
  await viaApp(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "900.00", stops: [
    { type: "pickup", name: "Shipper", city: "Dallas", state: "TX", appt_start: soon },
    { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: soon },
  ] });
  await open(page, account, "dashboard");

  // The name teammates see.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Profile & preferences" }).click();
  const profile = page.getByRole("dialog", { name: "Profile & preferences" });
  await profile.getByLabel("Your name").fill("Olive Q. Owner");
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".toastw")).toContainText("Your name is saved");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Olive Q. Owner");

  // "?" anywhere outside a box shows the shortcuts.
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toContainText("Search everything");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

  // A kind turned off leaves the bell.
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  await expect(bell).toContainText("Loads waiting for a driver");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Notification settings" }).click();
  const settings = page.getByRole("dialog", { name: "Notification settings" });
  await expect(settings).toContainText("Email");
  await settings.getByLabel("Loads waiting for a driver").uncheck();
  await settings.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(bell).not.toContainText("Loads waiting for a driver");
});
