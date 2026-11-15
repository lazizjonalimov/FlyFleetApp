import { expect, test } from "@playwright/test";
import { address, open, W } from "./helpers";

test("a load opens in the drawer, the address carries it, and Back closes it", async ({ page }) => {
  await open(page, "/loads");
  await page.getByRole("button", { name: "FF-24817" }).first().click();
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Fort Worth, TX → Oklahoma City, OK");
  expect(address(page)).toBe(`${W}/loads?drawer=FF-24817`);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  expect(address(page)).toBe(`${W}/loads`);

  await page.goBack();
  await expect(drawer).toBeVisible();
  await page.goBack();
  await expect(drawer).toBeHidden();
});

test("a link to an open drawer opens it", async ({ page }) => {
  await open(page, "/loads?drawer=FF-24790");
  const drawer = page.getByRole("complementary", { name: "Load details" });
  await expect(drawer).toContainText("FF-24790");
  await expect(drawer).toContainText("POD missing");
});

test("from the drawer to the load's page and back by the breadcrumb", async ({ page }) => {
  await open(page, "/loads?drawer=FF-24817");
  await page.getByRole("button", { name: "Open full page" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${W}/loads/FF-24817$`));
  await expect(page.getByRole("heading", { name: "Fort Worth, TX → Oklahoma City, OK" })).toBeVisible();
  await expect(page.locator(".lcs.cur")).toContainText("In transit");

  await page.locator(".crumb").getByRole("button", { name: "Loads" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/loads$`));
});

test("selecting loads brings up the bulk actions", async ({ page }) => {
  await open(page, "/loads");
  await page.getByRole("button", { name: "Select row" }).nth(0).click();
  await page.getByRole("button", { name: "Select row" }).nth(2).click();
  await expect(page.locator(".bulk")).toContainText("2 selected");
  await expect(page.locator(".bulk").getByRole("button")).toHaveText(["Assign driver", "Change status", "Print BOLs", "Export", ""]);

  await page.getByRole("button", { name: "Select all loads" }).click();
  await expect(page.locator(".bulk")).toBeHidden();
  await page.getByRole("button", { name: "Select all loads" }).click();
  await expect(page.locator(".bulk")).toContainText("14 selected");
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.locator(".bulk")).toBeHidden();
});

test("the dashboard's exceptions lead to the load they are about", async ({ page }) => {
  await open(page, "/dashboard");
  await page.locator(".attn", { hasText: "Delivery will miss its appointment" }).getByRole("button", { name: "Review" }).click();
  await expect(page).toHaveURL(new RegExp(`${W}/loads\\?drawer=FF-24817$`));
  await expect(page.getByRole("complementary", { name: "Load details" })).toBeVisible();
});

test("New load opens the add flow, and the guided form has its own address", async ({ page }) => {
  await open(page, "/loads");
  await page.getByRole("button", { name: "New load" }).click();
  await expect(page.getByRole("dialog")).toContainText("New load");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await open(page, "/loads/new");
  await expect(page.getByRole("heading", { name: "New load" })).toBeVisible();
  await expect(page.locator(".nls.cur")).toContainText("Stops & appointments");
});

test("assigning from the dispatch queue opens the panel with eligible drivers and reasons", async ({ page }) => {
  await open(page, "/dispatch");
  await page.locator(".qcard", { hasText: "FF-24851" }).getByRole("button", { name: "Assign" }).click();
  const panel = page.getByRole("complementary", { name: "Assign load" });
  await expect(panel).toContainText("FF-24851");
  await expect(panel.locator(".cand")).toHaveCount(6);
  await expect(panel.locator(".cand.on")).toContainText("Best match");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
