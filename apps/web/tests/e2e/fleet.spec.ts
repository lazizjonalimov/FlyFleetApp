import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
const driver = (first: string, last: string) => ({ first_name: first, last_name: last, cdl_expiry: day(400), medical_cert_expiry: day(400) });

test("a truck's record: assign a team, see who owns it and its history", async ({ page }) => {
  const account = await signUp(page);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "812", year: 2023, make: "Volvo", model: "VNL 760", engine: "Volvo D13 · 500 hp", ...PAPERS });
  await viaApp(page, "POST", "/drivers", driver("Ken", "Ito"));
  await viaApp(page, "POST", "/drivers", driver("Katie", "Walsh"));

  await open(page, account, `equipment/trucks/${truck.id}`);
  await expect(page.getByRole("heading", { name: "812", level: 1 })).toBeVisible();
  await expect(page.locator(".ph")).toContainText("Company fleet");
  await expect(page.locator(".main")).toContainText("Volvo D13 · 500 hp");
  await expect(page.locator(".main")).toContainText("Nobody is assigned to this truck.");

  await page.getByRole("button", { name: "Assign driver" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign a driver to 812" });
  await dialog.getByRole("button", { name: /^Driver:/ }).click();
  await dialog.getByRole("option", { name: "Ken Ito" }).click();
  await dialog.getByText("Team truck · two drivers, one truck").click();
  await dialog.getByRole("button", { name: /^Co-driver:/ }).click();
  await dialog.getByRole("option", { name: "Katie Walsh" }).click();
  await dialog.getByRole("radio", { name: "By the miles each one drove" }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("812: drivers set");
  await expect(page.locator(".banner", { hasText: "Team truck" })).toContainText("Ken and Katie run it together and split pay by the miles each one drove");
  await expect(page.locator(".card", { hasText: "Assignment history" })).toContainText("Team with Katie Walsh · by miles");
  await expect(page.locator(".card", { hasText: "Owner and agreement" })).toContainText("None · company equipment");
  await expect(page.locator(".card", { hasText: "Ownership history" })).toContainText("Owned outright");
});
