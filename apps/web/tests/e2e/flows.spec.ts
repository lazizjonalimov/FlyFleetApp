import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("add a driver from a CDL photo: choose, upload, check what was read, save", async ({ page }) => {
  await open(page, "/drivers");
  await page.getByRole("button", { name: "Add driver" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.locator(".choice")).toHaveCount(2);
  await modal.locator(".choice", { hasText: "Scan the CDL" }).click();
  // the front of the licence is enough to go on
  await modal.getByRole("button", { name: "Upload" }).first().click();
  await expect(modal).toContainText("Check what we read");
  await expect(modal.locator(".idcard")).toBeVisible();
  await modal.getByRole("button", { name: "Create driver" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Carlos Medina added");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".toast")).toBeHidden();
});

test("add a driver by hand: the issuing state comes from a searchable list", async ({ page }) => {
  await open(page, "/drivers?modal=add&kind=driver&modalStep=manual");
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: /state/i }).first().click();
  await expect(page.getByRole("option")).toHaveCount(51);
  await page.getByRole("listbox").locator("..").locator("input").fill("tex");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: /Texas/ }).click();
  await expect(modal.getByRole("button", { name: /state/i }).first()).toContainText("Texas");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("a truck's make can be something that is not on the list", async ({ page }) => {
  await open(page, "/equipment/trucks?modal=add&kind=truck&modalStep=manual&preset=other");
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("button", { name: /Make/ })).toContainText("Other");
  await expect(modal.locator("input.othr").first()).toHaveValue("Kalmar");
});

test("importing drivers from a spreadsheet: columns are matched before anything is saved", async ({ page }) => {
  await open(page, "/drivers?modal=import&kind=driver&modalStep=map");
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("Import drivers");
  await expect(modal.locator(".selb").first()).toBeVisible();
  await expect(modal.locator(".mst li.cur")).toContainText("Match columns");
  await modal.getByRole("button", { name: "Check 24 rows" }).click();
  await expect(modal.locator(".mst li.cur")).toContainText("Review");
});

test("a fuel receipt from a photo lands on the purchases with a confirmation", async ({ page }) => {
  await open(page, "/finance/fuel?role=accounting&modal=add&kind=fuel&modalStep=review");
  const modal = page.getByRole("dialog");
  await expect(modal.locator(".rcpt")).toBeVisible();
  await modal.locator(".mfoot .btn.pri").click();
  await expect(page.getByRole("status")).toBeVisible();
});

test("the dashboard's charts switch between chart and table", async ({ page }) => {
  await open(page, "/dashboard?role=owner");
  const revenue = page.getByRole("region", { name: "Invoiced revenue by week" });
  await revenue.getByRole("button", { name: "Table" }).click();
  await expect(revenue.getByRole("table", { name: "Invoiced revenue by week" })).toBeVisible();
  await expect(revenue.getByRole("row")).toHaveCount(13);
  await revenue.getByRole("button", { name: "Chart" }).click();
  await expect(revenue.getByRole("group", { name: "Columns, one per week" })).toBeVisible();
});

test("the live map and the messages follow the selection", async ({ page }) => {
  await open(page, "/tracking");
  await expect(page.locator(".mrow")).toHaveCount(11);
  await expect(page.locator(".mrow.on")).toContainText("T-1121");

  await open(page, "/messages");
  await expect(page.locator(".cvi")).toHaveCount(7);
  await expect(page.locator(".cvi.on")).toContainText("Jamal Carter");
});
