import { expect, test } from "@playwright/test";
import { day, nav, open, PASSWORD, signUp, unique, viaApp } from "./helpers";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };

test("dispatch teams: a team with its dispatcher and trucks, previewed as the dispatcher sees it", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/vehicles", { unit_number: "T-11", ...PAPERS });
  await viaApp(page, "POST", "/vehicles", { unit_number: "T-22", ...PAPERS });
  await viaApp(page, "POST", "/members", { email: `${unique("jo")}@example.com`, full_name: "Jordan Lee", password: PASSWORD, role: "dispatcher" });

  await open(page, account, "settings/dispatch-teams");
  await expect(page.getByText("No dispatch teams yet")).toBeVisible();
  await expect(page.locator(".dtdef")).toContainText("1 dispatcher · Jordan Lee. Sees all 2 trucks and every load.");
  await page.getByRole("button", { name: "New dispatch team" }).first().click();
  const create = page.getByRole("dialog", { name: "New dispatch team" });
  await create.getByLabel("Name").fill("North");
  await create.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("status")).toContainText("North created");

  await page.getByRole("button", { name: "Add dispatcher" }).click();
  const people = page.getByRole("dialog", { name: "Dispatchers in North" });
  await people.getByRole("checkbox", { name: /Jordan Lee/ }).click();
  await people.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".dpill", { hasText: "Jordan Lee" })).toBeVisible();

  await page.getByRole("button", { name: "Add trucks" }).click();
  const trucks = page.getByRole("dialog", { name: "Trucks in North" });
  await trucks.getByRole("checkbox", { name: /T-11/ }).click();
  await trucks.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".tchip", { hasText: "T-11" })).toBeVisible();
  await expect(page.getByText("Scoped to 1 truck")).toBeVisible();
  await expect(page.locator(".tmside")).toContainText("North1");
  await expect(page.locator(".tmside")).toContainText("No team1");
  await expect(page.locator(".tmside")).toContainText("added T-11 to North");

  // The team as its dispatcher sees it: their trucks only, and nothing can be changed.
  await page.getByRole("button", { name: "Preview as Jordan Lee" }).click();
  await expect(page.locator(".pvbar")).toContainText("Previewing as Jordan Lee · Dispatcher in North");
  await expect(page.locator(".scope")).toHaveText("North · 1 truck");
  await nav(page, "Trucks").click();
  await expect(page.locator(".trow", { hasText: "T-11" })).toBeVisible();
  await expect(page.locator(".trow", { hasText: "T-22" })).toHaveCount(0);
  await page.getByRole("button", { name: "Exit preview" }).click();
  await expect(page.locator(".pvbar")).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/dispatch-teams$/);
});
