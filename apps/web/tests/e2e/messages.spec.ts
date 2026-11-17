import { expect, test } from "@playwright/test";
import { day, nav, open, PASSWORD, signIn, signUp, unique, viaApp } from "./helpers";

const QUALIFIED = { cdl_expiry: day(400), medical_cert_expiry: day(400) };

test("messages: a driver on the app gets a message, the office sees it read, and their reply comes in", async ({ page, browser }) => {
  const account = await signUp(page);
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Rosa", last_name: "Diaz", ...QUALIFIED });
  const email = `${unique("rosa")}@example.com`;
  const member = await viaApp<{ user_id: string }>(page, "POST", "/members", { email, full_name: "Rosa Diaz", password: PASSWORD, role: "driver" });
  await viaApp(page, "PATCH", `/drivers/${driver.id}`, { user_id: member.user_id });

  // From the driver's profile: how messages reach her, and the conversation.
  await open(page, account, `drivers/${driver.id}`);
  const channels = page.locator("section.card", { hasText: "Connected channels" });
  await expect(channels).toContainText("Signed in · messages, alerts and load updates arrive in the app");
  await expect(channels).toContainText("Not linked · Telegram isn’t connected for the company yet");
  await page.getByRole("button", { name: "Message", exact: true }).click();
  await expect(page).toHaveURL(/\/messages\?c=/);
  const thread = page.getByRole("region", { name: "Conversation with Rosa Diaz" });
  await expect(thread).toContainText("App · signed in");
  await expect(thread).toContainText("No messages yet");

  await thread.getByRole("button", { name: "Call me when stopped" }).click();
  await expect(thread.getByLabel("Message Rosa")).toHaveValue("Call me when stopped");
  await thread.getByRole("button", { name: "Send via: App" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: /Telegram/ })).toBeDisabled();
  await page.getByRole("menuitemcheckbox", { name: /Driver app/ }).press("Escape");
  await thread.getByRole("button", { name: "Send", exact: true }).click();
  await expect(thread.locator(".mrow2.out")).toContainText("Call me when stopped");
  await expect(thread.locator(".mrow2.out")).toContainText("App · sent");

  // The driver app picks it up, she reads it and answers.
  const phone = await browser.newPage();
  await signIn(phone, email);
  await phone.waitForURL((url) => !url.pathname.startsWith("/login"));
  const inbox = await viaApp<{ messages: { body: string }[] }>(phone, "GET", "/driver/messages");
  expect(inbox.messages.map((m) => m.body)).toEqual(["Call me when stopped"]);
  await viaApp(phone, "POST", "/driver/messages/read");
  await viaApp(phone, "POST", "/driver/messages", { body: "Stopped at the rest area, calling now" });
  await phone.close();

  await page.reload();
  await expect(thread.locator(".mrow2.out")).toContainText("App · read");
  await expect(thread.locator(".mrow2:not(.out)")).toContainText("Stopped at the rest area, calling now");
  await expect(thread.locator(".mrow2:not(.out)")).toContainText("via app");
  const row = page.getByRole("region", { name: "Conversations" }).getByRole("button", { name: /Rosa Diaz/ });
  await expect(row).toContainText("Stopped at the rest area, calling now");
  await expect(nav(page, "Messages")).not.toContainText("1");
});

test("messages: nothing is sent where no channel reaches them, and a team conversation", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/drivers", { first_name: "Ken", last_name: "Ito", ...QUALIFIED });
  await viaApp(page, "POST", "/members", { email: `${unique("dee")}@example.com`, full_name: "Dee Dispatcher", password: PASSWORD, role: "dispatcher" });

  await open(page, account, "messages");
  await expect(page.getByText("No conversations yet").first()).toBeVisible();
  await page.getByRole("button", { name: "New message" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New message" });
  await dialog.getByRole("button", { name: "Choose a driver" }).click();
  await page.getByRole("option", { name: /Ken Ito/ }).click();
  await dialog.getByRole("button", { name: "Open conversation" }).click();
  const thread = page.getByRole("region", { name: "Conversation with Ken Ito" });
  await expect(thread).toContainText("Not on the app");
  await expect(thread).toContainText("Ken can’t get messages yet: not signed up to the driver app yet");
  await expect(thread.getByRole("textbox")).toHaveCount(0);

  await page.getByRole("button", { name: "New message" }).first().click();
  await dialog.getByRole("tab", { name: "Teammates" }).click();
  await dialog.getByLabel("Name").fill("Night desk");
  await dialog.getByRole("checkbox", { name: /Dee Dispatcher/ }).click();
  await dialog.getByRole("button", { name: "Open conversation" }).click();
  const team = page.getByRole("region", { name: "Conversation with Night desk" });
  await team.getByLabel("Message Night desk").fill("Covering the late pickups tonight");
  await team.getByRole("button", { name: "Send", exact: true }).click();
  await expect(team.locator(".mrow2.out")).toContainText("Covering the late pickups tonight");
  await expect(page.getByRole("region", { name: "Conversations" })).toContainText("You: Covering the late pickups tonight");
});

test("my tasks: an alert gives its owner a task, a task by hand, and done", async ({ page }) => {
  const account = await signUp(page);
  const customer = await viaApp<{ id: string }>(page, "POST", "/customers", { name: "Globex" });
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const load = await viaApp<{ load_number: string }>(page, "POST", "/loads", {
    customer_id: customer.id, customer_rate: "1200.00", stops: [
      { type: "pickup", name: "Shipper DC", city: "Dallas", state: "TX", appt_start: inHours(3) },
      { type: "delivery", name: "Receiver", city: "Austin", state: "TX", appt_start: inHours(9) }] });

  await open(page, account, "tasks");
  await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  const alertTask = page.locator(".trow", { hasText: `Assign a driver to ${load.load_number}` });
  await expect(alertTask).toContainText("Pickup");
  await expect(alertTask).toContainText("High");
  await expect(alertTask.getByRole("button", { name: "Assign" })).toBeVisible();
  await expect(nav(page, "My tasks")).toContainText("1");

  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Task").fill("Call the insurance broker");
  await dialog.getByRole("radio", { name: "High" }).click();
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("status")).toContainText("Task added");
  const mine = page.locator(".trow", { hasText: "Call the insurance broker" });
  await expect(mine).toContainText("Today");
  await mine.locator(".chk").click();
  await expect(page.getByRole("status")).toContainText("Done: Call the insurance broker");
  await expect(page.locator(".trow", { hasText: "Call the insurance broker" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Done/ }).click();
  await expect(page.locator(".trow", { hasText: "Call the insurance broker" })).toBeVisible();
});
