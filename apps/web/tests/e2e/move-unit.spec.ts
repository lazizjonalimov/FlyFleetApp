import { expect, test } from "@playwright/test";
import { day, live, signUp, viaApp } from "./helpers";

test("moving a truck to another company: preview what changes, then confirm", async ({ page }) => {
  const account = await signUp(page, "Acme Trucking");
  const bravo = await viaApp<{ id: string; slug: string }>(page, "POST", "/account/companies", { name: "Bravo Logistics" });
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-77", vin: "1FUJGLDR12LM12345", insurance_expiry: day(400), registration_expiry: day(400), inspection_expiry: day(400) });
  await viaApp(page, "POST", "/dispatch-teams", { name: "North", user_ids: [], vehicle_ids: [truck.id] });

  await page.goto(`/${account.slug}/equipment/trucks/${truck.id}`);
  await live(page);
  await page.getByRole("button", { name: "Move to another company" }).click();
  const dialog = page.getByRole("dialog", { name: /Move T-77 to another company/ });
  await dialog.getByLabel("Move to").selectOption({ label: "Bravo Logistics" });
  await dialog.getByRole("button", { name: "Preview the move" }).click();
  await expect(dialog).toContainText("Nothing has moved yet");
  await expect(dialog).toContainText("It leaves North");
  await dialog.getByRole("button", { name: /Move truck to Bravo Logistics/ }).click();

  // The truck arrives as a new record in Bravo, and stays behind read-only.
  await page.waitForURL(new RegExp(`/${bravo.slug}/equipment/trucks/`));
  await live(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("T-77");
  await page.goto(`/${account.slug}/equipment/trucks/${truck.id}`);
  await live(page);
  await expect(page.locator(".main")).toContainText("Transferred");
  await expect(page.getByRole("button", { name: "Move to another company" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});
