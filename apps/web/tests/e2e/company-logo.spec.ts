import { expect, test, type Locator } from "@playwright/test";
import { open, signUp } from "./helpers";

// A real 120 × 60 PNG: the API reads it and fits it into a square.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAYAAACtrX6oAAAAqklEQVR4nO3RAQnAIAAAwbkARrWSUV2KITx3CR5+zL3OQ9Z7O4B/GRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncJzBcQbHGRxncNwH0LsCkki/yMAAAAAASUVORK5CYII=", "base64");
const drawn = (img: Locator) => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

test("a company logo instead of its initials, from Settings and from Add a company", async ({ page }) => {
  const account = await signUp(page, "Acme Trucking");
  const switcher = page.getByRole("button", { name: "Switch company" });
  await expect(switcher.locator("img")).toHaveCount(0);

  // Settings › Organization: upload, and it replaces the initials in the sidebar.
  await open(page, account, "settings/integrations");
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload logo" }).click();
  await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".toastw")).toContainText("Company logo updated");
  await expect(switcher.locator("img")).toHaveCount(1);
  await expect.poll(() => drawn(switcher.locator("img"))).toBe(true);

  // The Companies page shows it too; removing it brings the initials back.
  await open(page, account, "settings/account/companies");
  await expect(page.getByRole("button", { name: /^Acme Trucking[,:]/ }).locator("img")).toHaveCount(1);
  await open(page, account, "settings/integrations");
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.locator(".toastw")).toContainText("Company logo removed");
  await expect(switcher.locator("img")).toHaveCount(0);

  // Add a company with a logo: previewed in the wizard, and the new company shows it.
  await switcher.click();
  await page.getByRole("menuitem", { name: /Add a company/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add a company" });
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("Legal company name").fill("Logo Freight Lines");
  await dialog.getByLabel("MC number").fill(String(Date.now()).slice(-6));
  await dialog.getByLabel("Home state").selectOption("OH");
  await dialog.getByLabel("Fleet size").selectOption("1-5");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByRole("button", { name: "Use initials instead" })).toBeVisible();
  await expect(dialog.locator(".cmark img")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toContainText("logo.png");
  await dialog.getByRole("button", { name: "Create company" }).click();
  await expect(page.locator(".toastw")).toContainText("Logo Freight Lines created · you are its Main Admin");
  await expect(switcher).toContainText("Logo Freight Lines");
  await expect.poll(() => drawn(switcher.locator("img"))).toBe(true);
});
