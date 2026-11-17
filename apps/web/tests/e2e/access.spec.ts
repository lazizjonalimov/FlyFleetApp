import { expect, test } from "@playwright/test";
import { open, PASSWORD, signUp, unique } from "./helpers";

test("roles: a template role changed and saved, with its history", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "settings/team");
  await page.getByRole("button", { name: /^Roles & permissions/ }).click();
  await page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name: /^Dispatcher/ }).click();
  await page.getByRole("button", { name: "Reports — Export" }).click();
  await expect(page.locator(".savebar")).toContainText("1 unsaved change to Dispatcher");
  await expect(page.locator(".tmside")).toContainText("+ grantReports › Export");
  await page.getByRole("button", { name: "Review & save" }).click();
  await page.getByRole("dialog", { name: "Save Dispatcher" }).getByRole("button", { name: "Save role" }).click();
  await expect(page.getByRole("status")).toContainText("Dispatcher saved");
  await expect(page.locator(".savebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reports — Export" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".tmside")).toContainText("granted Reports › Export for Dispatcher");
  await expect(page.getByText("Changed for this company")).toBeVisible();
  // The owner's role is FlyFleet's own and can't be changed.
  await page.getByRole("navigation", { name: "Roles" }).getByRole("button", { name: /^Owner System/ }).click();
  await expect(page.getByRole("button", { name: "Loads — View" })).toBeDisabled();
});

test("invitations: a link that joins the company, opened by the new member", async ({ page, browser }) => {
  const account = await signUp(page);
  await open(page, account, "settings/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite member" });
  const email = `${unique("rosa")}@example.com`;
  await dialog.getByLabel("Name").fill("Rosa Diaz");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").selectOption("dispatcher");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  const link = await dialog.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]{20,}$/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: /^Invitations/ }).click();
  await expect(page.locator(".trow", { hasText: "Rosa Diaz" })).toContainText("Waiting");

  const visitor = await browser.newPage();
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: "Join Acme Trucking" })).toBeVisible();
  await expect(visitor.getByText("Olive Owner invited you as Dispatcher.")).toBeVisible();
  await visitor.getByLabel("Password").fill(PASSWORD);
  await visitor.getByRole("button", { name: "Join Acme Trucking" }).click();
  await visitor.waitForURL(/\/dashboard$/);
  await visitor.goto(link);
  await expect(visitor.getByRole("heading", { name: "This invitation has been used" })).toBeVisible();
  await visitor.close();

  await page.reload();
  await expect(page.locator(".trow", { hasText: "Rosa Diaz" })).toContainText("Dispatcher");
  await page.getByRole("button", { name: /^Invitations/ }).click();
  await expect(page.locator(".trow", { hasText: "Rosa Diaz" })).toContainText("Joined");
});
