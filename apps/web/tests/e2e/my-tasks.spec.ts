import { expect, test } from "@playwright/test";
import { nav, open, PASSWORD, signUp, unique, viaApp } from "./helpers";

const SHOTS = process.env.TASK_SHOTS;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

test("My tasks: tabs, saved views, a blocked task, undo, snooze, bulk, the drawer and the board", async ({ page }) => {
  const account = await signUp(page);
  const member = await viaApp<{ user_id: string }>(page, "POST", "/members", { email: `${unique("dee")}@example.com`, full_name: "Dee Dispatcher", password: PASSWORD, role: "dispatcher" });
  const rate = await viaApp<{ id: string }>(page, "POST", "/tasks", { title: "Get the rate confirmation", priority: "medium", due_at: inHours(-1) });
  await viaApp(page, "POST", "/tasks", { title: "Dispatch the reefer load", priority: "high", due_at: inHours(0.25), blocked_by: rate.id });
  await viaApp(page, "POST", "/tasks", { title: "Reconcile fuel purchases", priority: "low", due_at: inHours(30), recurrence: "weekly", subtasks: ["Import the file", "Match purchases", "Flag cards"] });
  await viaApp(page, "POST", "/tasks", { title: "Book the trailer wash", assignee_user_id: member.user_id });

  await open(page, account, "tasks");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Overview\s*My tasks/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My tasks");
  await expect(page.getByRole("tab", { name: /^Open/ })).toContainText("3");
  await expect(page.getByRole("tab", { name: /^Assigned by me/ })).toContainText("1");
  await expect(nav(page, "My tasks")).toContainText("3");
  await expect(page.getByRole("region", { name: "Overdue" })).toContainText("Get the rate confirmation");
  await expect(page.getByRole("region", { name: "Now · within 30 min" })).toContainText("Blocked by Get the rate confirmation");
  await expect(page.getByRole("region", { name: "Later" })).toContainText("0 of 3");
  await expect(page.getByRole("region", { name: "Later" })).toContainText("Weekly");
  await expect(page.getByText("recorded in the audit log")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tasks-list.png` });

  // Saved views: the two to start from, pressed when the screen matches; save and remove one.
  const views = page.getByRole("group", { name: "Saved views" });
  await views.getByRole("button", { name: "Assigned by me", exact: true }).click();
  await expect(views.getByRole("button", { name: "Assigned by me", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: /^Assigned by me/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".trow", { hasText: "Book the trailer wash" })).toBeVisible();
  await page.getByRole("tab", { name: /^Open/ }).click();
  await page.getByLabel("Priority", { exact: true }).selectOption("low");
  await views.getByRole("button", { name: "Save current filters…" }).click();
  const save = views.getByRole("button", { name: "Save", exact: true });
  await views.getByLabel("Name this view").fill("L");
  await expect(save).toBeDisabled();
  await views.getByLabel("Name this view").fill("Low ones");
  await save.click();
  await expect(views.getByRole("button", { name: "Low ones", exact: true })).toHaveAttribute("aria-pressed", "true");
  await views.getByRole("button", { name: "Remove saved view Low ones" }).click();
  await expect(views.getByRole("button", { name: "Low ones", exact: true })).toHaveCount(0);
  await page.getByLabel("Priority", { exact: true }).selectOption("all");

  // A blocked task can't be completed.
  await page.getByRole("button", { name: "Complete Dispatch the reefer load" }).click();
  await expect(page.locator(".toastw")).toContainText("Finish ‘Get the rate confirmation’ first");

  // The drawer: why, blocking, priority with a toast and history, a comment; Escape closes it.
  await page.getByRole("button", { name: "Get the rate confirmation", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "Task details" });
  await expect(drawer).toContainText("Why this task exists");
  await expect(drawer).toContainText("Blocking: Dispatch the reefer load");
  await drawer.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" }).click();
  await expect(page.locator(".toastw")).toContainText("Priority set to High");
  await expect(drawer.getByRole("group", { name: "Priority" }).getByRole("button", { name: "High" })).toHaveAttribute("aria-pressed", "true");
  await drawer.getByLabel("Add a comment").fill("Asked the broker again");
  await drawer.getByRole("button", { name: "Comment" }).click();
  await expect(drawer.getByRole("region", { name: "Comments" })).toContainText("Olive Owner · Today");
  await expect(drawer.getByRole("region", { name: "Comments" })).toContainText("Asked the broker again");
  await expect(drawer.getByLabel("Add a comment")).toHaveValue("");
  await expect(drawer.getByRole("region", { name: "History" })).toContainText("Priority Medium → High");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tasks-drawer.png` });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  // Complete, then Undo puts it back.
  await page.getByRole("button", { name: "Complete Get the rate confirmation" }).click();
  await expect(page.locator(".toastw")).toContainText("Done: Get the rate confirmation");
  await page.locator(".toastw").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Complete Get the rate confirmation" })).toBeVisible();

  // Snooze from the row: it moves to Snoozed.
  await page.getByRole("button", { name: "Snooze Reconcile fuel purchases" }).click();
  await page.getByRole("dialog", { name: "Snooze until" }).getByRole("button", { name: /^Tomorrow morning/ }).click();
  await expect(page.locator(".toastw")).toContainText("Snoozed until Tomorrow 08:00");
  await expect(page.getByRole("tab", { name: /^Snoozed/ })).toContainText("1");
  await page.getByRole("tab", { name: /^Snoozed/ }).click();
  await expect(page.locator(".trow", { hasText: "Reconcile fuel purchases" })).toContainText("Snoozed · Tomorrow 08:00");
  await page.getByRole("tab", { name: /^Open/ }).click();

  // Select, then change priority for both at once.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  const bulk = page.getByRole("toolbar", { name: "Bulk actions" });
  await expect(bulk).toContainText("2 selected");
  await bulk.getByRole("button", { name: "Priority…" }).click();
  await page.getByRole("dialog", { name: "Set priority" }).getByRole("button", { name: "Low" }).click();
  await expect(page.locator(".toastw")).toContainText("2 tasks set to Low");
  await expect(bulk).toHaveCount(0);

  // Board and calendar, by keyboard too.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("2");
  await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
  const overdue = page.getByRole("region", { name: "Overdue" });
  await expect(overdue).toContainText("Get the rate confirmation");
  await overdue.getByRole("button", { name: "Move Get the rate confirmation to Now" }).click();
  await expect(page.locator(".toastw")).toContainText("Moved to Now");
  await expect(page.getByRole("region", { name: "Now" })).toContainText("Get the rate confirmation");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tasks-board.png` });
  await page.keyboard.press("3");
  await page.getByRole("group", { name: "Calendar range" }).getByRole("button", { name: "Week" }).click();
  await expect(page.getByRole("region", { name: /^Today/ })).toContainText("Get the rate confirmation");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tasks-week.png` });
  await page.getByRole("group", { name: "Calendar range" }).getByRole("button", { name: "Month" }).click();
  await expect(page.getByRole("group", { name: /, today:/ })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tasks-month.png` });
});

test("New task from a template, a repeating task giving the next one, reminders and insights", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "tasks");
  await expect(page.getByText("You’re all caught up")).toBeVisible();

  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill("ab");
  await dialog.getByLabel("Details").click();
  await expect(dialog.getByText("Use at least 3 characters")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create task" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Weekly: reconcile fuel" }).click();
  await expect(dialog.getByLabel("Title")).toHaveValue("Reconcile fuel purchases");
  await expect(dialog.getByLabel("Repeat")).toHaveValue("weekly");
  await dialog.getByLabel("Linked to").selectOption("load");
  await expect(dialog.getByRole("button", { name: "Create task" })).toBeDisabled();
  await dialog.getByLabel("Load ID or name").fill("NOPE-404");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog.getByText("No load NOPE-404 found")).toBeVisible();
  await dialog.getByLabel("Linked to").selectOption("");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(page.locator(".toastw")).toContainText("Task created: Reconcile fuel purchases");

  const row = page.locator(".trow", { hasText: "Reconcile fuel purchases" });
  await expect(row).toContainText("0 of 3");
  await row.getByRole("button", { name: "Complete Reconcile fuel purchases" }).click();
  await expect(page.locator(".toastw")).toContainText(/Done: Reconcile fuel purchases · next one created for /);
  await expect(page.locator(".trow", { hasText: "Reconcile fuel purchases" })).toHaveCount(1);

  await page.getByRole("button", { name: "Reminders" }).click();
  const reminders = page.getByRole("dialog", { name: "Reminders and daily summary" });
  await expect(reminders).toContainText("1 open · 0 due today · 0 overdue");
  await reminders.getByLabel("Send at").selectOption("06:30");
  await reminders.getByRole("button", { name: "Telegram" }).click();
  await expect(reminders.getByRole("button", { name: "Telegram" })).toHaveAttribute("aria-pressed", "true");
  await reminders.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".toastw")).toContainText("Morning summary on · 06:30 by telegram");

  const insights = page.getByRole("button", { name: "Insights" });
  await insights.click();
  await expect(insights).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Insights" })).toContainText("Done today1");
  await page.getByRole("button", { name: "My team’s" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My team’s tasks");
  await expect(page.getByRole("region", { name: "Insights" })).toContainText("Open tasks per person");
});
