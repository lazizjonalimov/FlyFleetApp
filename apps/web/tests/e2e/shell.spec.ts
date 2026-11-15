import { expect, test } from "@playwright/test";
import { address, nav, open, signIn, W } from "./helpers";

test("sign in, choose the organization, sign out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await signIn(page);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Dana Kim");
  await expect(page.getByRole("button", { name: "Switch organization" })).toContainText("Lone Star Freight");

  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu", { name: "Account" })).toContainText("dana.kim@lonestarfreight.com");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a different account goes back from the organizations to the form", async ({ page }) => {
  await open(page, "/login");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Use a different account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

const SECTIONS: [label: string, path: string, heading: string][] = [
  ["My tasks", "/tasks", "My tasks"],
  ["Dispatch board", "/dispatch", "Dispatch board"],
  ["Loads", "/loads", "Loads"],
  ["Live fleet", "/tracking", "Live fleet"],
  ["Fleet alerts", "/alerts", "Fleet alerts"],
  ["Messages", "/messages", "Messages"],
  ["Customers", "/customers", "Customers"],
  ["Drivers", "/drivers", "Drivers"],
  ["Owners", "/owners", "Owners"],
  ["Compliance", "/safety", "Compliance"],
  ["Inspections", "/inspections", "Inspections"],
  ["Documents", "/documents", "Documents"],
  ["Trucks", "/equipment/trucks", "Trucks"],
  ["Trailers", "/equipment/trailers", "Trailers"],
  ["Maintenance", "/maintenance", "Maintenance"],
  ["Invoices", "/finance/invoices", "Invoices"],
  ["Statements", "/finance/statements", "Statements"],
  ["Fuel & IFTA", "/finance/fuel", "Fuel & IFTA"],
  ["Reports", "/reports", "Reports"],
  ["Team & access", "/settings/team", "Team & access"],
  ["Settings", "/settings/integrations", "Settings"],
  ["Audit log", "/settings/audit-log", "Audit log"],
  ["Dashboard", "/dashboard", "Dashboard"],
];

test("the sidebar leads to every section, each at its own address", async ({ page }) => {
  await open(page, "/dashboard");
  for (const [label, path, heading] of SECTIONS) {
    await nav(page, label).click();
    await expect(page).toHaveURL(new RegExp(`${W}${path}$`));
    await expect(nav(page, label)).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".main").getByText(heading, { exact: true }).first()).toBeVisible();
  }
});

test("every section can be opened directly and survives a reload", async ({ page }) => {
  for (const [label, path] of SECTIONS) {
    await open(page, path);
    await expect(nav(page, label)).toHaveAttribute("aria-current", "page");
  }
  await open(page, "/owners/CT");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Castillo Transport LLC" })).toBeVisible();
});

test("search opens with the keyboard and with the search box, and Escape closes it", async ({ page }) => {
  await open(page, "/loads");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Search everything" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search everything" })).toBeHidden();

  await page.getByRole("button", { name: /^Search, press/ }).click();
  await expect(page.getByRole("dialog", { name: "Search everything" })).toBeVisible();
});

test("notifications, the assistant and Create open one at a time", async ({ page }) => {
  await open(page, "/dashboard");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.locator(".notif")).toBeVisible();

  await page.getByRole("button", { name: "Ask FlyFleet" }).click();
  await expect(page.locator(".aip")).toBeVisible();
  await expect(page.locator(".notif")).toBeHidden();

  await page.getByRole("button", { name: /^Create/ }).click();
  await expect(page.getByRole("menu", { name: "Create" })).toBeVisible();
  await expect(page.locator(".aip")).toBeHidden();
  await expect(page.getByRole("menuitem")).toHaveText([/New load/, /Add a driver/, /Add a truck/, /Add a trailer/, /Log an inspection/, /New invoice/, /Add an owner/]);
});

test("the sidebar collapses to icons and expands again", async ({ page }) => {
  await open(page, "/dispatch");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".shell")).toHaveClass(/mini/);
  await expect(nav(page, "Dispatch board")).toHaveAttribute("title", "Dispatch board");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".shell")).not.toHaveClass(/mini/);
});

test("an address that is not the console's is not found", async ({ page }) => {
  for (const path of [`${W}/nowhere`, `${W}/loads/FF-00000`, `${W}/owners/ZZ`, "/acme/dashboard"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "This page doesn’t exist" })).toBeVisible();
  }
  await page.getByRole("link", { name: "Go to your workspace" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("dark theme and comfortable density come from the address and stay while moving around", async ({ page }) => {
  await open(page, "/dashboard?theme=dark&density=comfortable");
  await expect(page.locator(".ff")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".ff")).toHaveAttribute("data-density", "comfortable");
  await nav(page, "Loads").click();
  await expect(page).toHaveURL(/\/loads\?theme=dark&density=comfortable$/);
  await expect(page.locator(".ff")).toHaveAttribute("data-theme", "dark");
  expect(address(page)).toBe(`${W}/loads?theme=dark&density=comfortable`);
});
