import { expect, test } from "@playwright/test";
import { live, nav, open, PASSWORD, signIn, signUp, unique, viaApp } from "./helpers";

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

test("your own account: profile, shortcuts, notifications and help, from the account menu", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
  await viaApp(page, "POST", "/loads", { customer_id: customer.id, commodity: "Paper", customer_rate: "900.00", stops: [
    { type: "pickup", name: "Shipper", city: "Dallas", state: "TX", appt_start: soon },
    { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: soon },
  ] });
  await open(page, account, "dashboard");

  // Profile & preferences is a Settings page, in the grouped list, with one primary action.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Profile & preferences" }).click();
  await page.waitForURL(/\/settings\/profile$/);
  await expect(page.getByRole("menu", { name: "Account" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Settings\s*Profile & preferences/);
  const list = page.getByRole("navigation", { name: "Settings sections" });
  await expect(list.getByRole("heading")).toHaveText(["You", "Organization", "Operations", "Data & billing"]);
  await expect(list.getByRole("button", { name: "Profile & preferences" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Sign-in email")).toHaveValue(account.email);
  await expect(page.getByLabel("Sign-in email")).not.toBeEditable();
  await expect(page.getByText("Change password")).toHaveCount(0);
  await page.getByLabel("Full name").fill("Olive Q. Owner");
  await page.getByLabel("Mobile phone").fill("+1 312 555 0142");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".toastw")).toContainText("saved");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Olive Q. Owner");
  // Theme and density take effect at once.
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator(".ff")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Comfortable" }).click();
  await expect(page.locator(".ff")).toHaveAttribute("data-density", "comfortable");
  // This device is listed under Sessions, with its own Sign out.
  await expect(page.locator(".sesrow", { hasText: "This device" })).toHaveCount(1);

  // Keyboard shortcuts open over the page; "?" outside a box opens them, Esc and Done close them.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  const keys = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(keys).toContainText("Search everything");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await keys.getByRole("button", { name: "Done" }).click();
  await expect(keys).toHaveCount(0);
  await page.getByLabel("Mobile phone").press("?");
  await expect(keys).toHaveCount(0);
  await page.locator("h1").click();
  await page.keyboard.press("?");
  await expect(keys).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(keys).toHaveCount(0);

  // A kind switched off In app leaves the bell.
  await page.locator("header").getByRole("button", { name: /^Notifications/ }).click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  await expect(bell).toContainText("Loads waiting for a driver");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Notification settings" }).click();
  await page.waitForURL(/\/settings\/notifications$/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Settings\s*Notifications/);
  const inApp = page.getByRole("switch", { name: "Assignments by In app" });
  await expect(inApp).toHaveAttribute("aria-checked", "true");
  await inApp.click();
  await expect(inApp).toHaveAttribute("aria-checked", "false");
  const email = page.getByRole("switch", { name: "Load late or at risk by Email" });
  await email.click();
  await expect(email).toHaveAttribute("aria-checked", "true");
  await page.locator("header").getByRole("button", { name: /^Notifications/ }).click();
  await expect(bell).not.toContainText("Loads waiting for a driver");
  await page.keyboard.press("Escape");
  await page.reload();
  await live(page);
  await expect(page.getByRole("switch", { name: "Load late or at risk by Email" })).toHaveAttribute("aria-checked", "true");

  // Help: the top bar's button and the account menu both open the help center.
  await page.getByRole("button", { name: "Help center" }).click();
  await page.waitForURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help center");
  await expect(page.getByRole("link", { name: "Contact support" }).first()).toHaveAttribute("href", /^mailto:/);
  await page.getByRole("button", { name: /^Account & access/ }).click();
  await page.getByText("How do I sign out of another computer?").click();
  await expect(page.getByText("Under Sessions, choose Sign out")).toBeVisible();
  await page.getByLabel("Search help").fill("zzzz nothing");
  await expect(page.getByText("No answers match")).toBeVisible();
  await open(page, account, "dashboard");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Help & support" }).click();
  await page.waitForURL(/\/help$/);
});

test("the account menu's pages open for a role that can't open Settings", async ({ page, browser }) => {
  const account = await signUp(page);
  const email = `${unique("dee")}@example.com`;
  await viaApp(page, "POST", "/members", { email, full_name: "Dee Dispatcher", password: PASSWORD, role: "dispatcher" });
  const dispatcher = await browser.newPage();
  await signIn(dispatcher, email);
  await dispatcher.waitForURL(/\/dashboard$/);
  await live(dispatcher);
  await dispatcher.goto(`/${account.slug}/settings/integrations`);
  await live(dispatcher);
  await expect(dispatcher.locator("main")).toContainText("Settings");
  await expect(dispatcher.getByRole("navigation", { name: "Settings sections" })).toHaveCount(0);

  for (const [item, path, heading] of [["Profile & preferences", "settings/profile", "Profile & preferences"], ["Notification settings", "settings/notifications", "Notifications"], ["Help & support", "help", "Help center"]]) {
    await dispatcher.getByRole("button", { name: "Account menu" }).click();
    await dispatcher.getByRole("menuitem", { name: item }).click();
    await dispatcher.waitForURL(new RegExp(`/${path}$`));
    await expect(dispatcher.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  // Only what the role can open is listed: the personal pages, and the alert policies a dispatcher reads.
  await dispatcher.goto(`/${account.slug}/settings/profile`);
  await live(dispatcher);
  const list = dispatcher.getByRole("navigation", { name: "Settings sections" });
  await expect(list.getByRole("heading")).toHaveText(["You", "Operations"]);
  await expect(list.getByRole("button")).toHaveText(["Profile & preferences", "Security & privacy", "Notifications", "Fleet alert policies"]);
  await dispatcher.getByLabel("Mobile phone").fill("+1 214 555 0199");
  await dispatcher.getByRole("button", { name: "Save changes" }).click();
  await expect(dispatcher.locator(".toastw")).toContainText("saved");

  // The dispatcher signs out of every other session of theirs, and stays signed in on this one.
  const second = await browser.newPage();
  await signIn(second, email);
  await second.waitForURL(/\/dashboard$/);
  await dispatcher.reload();
  await live(dispatcher);
  await expect(dispatcher.locator(".sesrow")).toHaveCount(2);
  await dispatcher.getByRole("button", { name: "Sign out of all other sessions" }).click();
  await dispatcher.getByRole("dialog", { name: "Sign out of all other sessions?" }).getByRole("button", { name: "Sign out others" }).click();
  await expect(dispatcher.locator(".sesrow")).toHaveCount(1);
  await second.reload();
  await expect(second).toHaveURL(/\/login/);
  await dispatcher.reload();
  await expect(dispatcher.getByRole("heading", { level: 1 })).toHaveText("Profile & preferences");
});
