import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";
import { textPdf } from "./pdf";

test("documents: uploaded and read on arrival, each field settled in review, then approved and attached", async ({ page }) => {
  const account = await signUp(page);
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-9", registration_expiry: day(10), insurance_expiry: day(400), inspection_expiry: day(400) });
  const pdf = textPdf([[[40, 740, "VEHICLE REGISTRATION"], [40, 700, "Plate: S9K 4416"], [300, 700, "State: TEXAS"], [450, 700, "Expires: 11/30/27"], [40, 610, "Year 2012"], [160, 610, "Make FRHT"]]]);

  // Uploaded from the inbox: the type says what it is usually filed with, and the truck is found by its number.
  await open(page, account, "documents");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a document" });
  await dialog.getByLabel("File", { exact: true }).setInputFiles({ name: "reg-T9.pdf", mimeType: "application/pdf", buffer: pdf });
  await dialog.getByLabel("Type").selectOption({ label: "Registration" });
  await expect(dialog.getByLabel("File it with")).toHaveValue("vehicle");
  await dialog.getByLabel("Truck").fill("T-9");
  await dialog.getByRole("option", { name: /T-9/ }).click();
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.locator(".toastw")).toContainText("Registration uploaded · waiting for review");

  // The inbox: read on arrival, one page, waiting for review.
  const row = page.locator(".tb2 .trow", { hasText: "reg-T9.pdf" });
  await expect(row).toContainText("Registration");
  await expect(row).toContainText("T-9");
  await expect(row).toContainText(/Upload · \w+/);
  await expect(row).toContainText("Needs review");
  await expect(row).toContainText("%");

  // The review: the fields read from the paper, a correction that needs its reason, and approve & attach.
  await row.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Registration · Truck T-9");
  const panel = page.locator(".fpanel");
  await expect(panel).toContainText("Extracted fields");
  await expect(panel.getByLabel("Plate expires", { exact: true })).toHaveValue("11/30/2027");
  const plate = panel.locator(".ofld", { hasText: "Plate" }).first();
  await plate.getByLabel("Plate", { exact: true }).fill("S9K 4418");
  await plate.getByRole("button", { name: "Save correction" }).click();
  await expect(page.locator(".toastw")).toContainText("Say why the value differs from what was read");
  await plate.getByLabel("Correction reason for plate").fill("Glare on the last digit");
  await plate.getByRole("button", { name: "Save correction" }).click();
  await expect(plate).toContainText("Corrected");
  await expect(plate).toContainText("Read as S9K 4416 · Glare on the last digit");

  await page.getByRole("button", { name: "Approve & attach" }).click();
  await page.getByRole("dialog", { name: "Approve and attach this registration?" }).getByRole("button", { name: "Approve & attach" }).click();
  await expect(page.locator(".toastw")).toContainText("Registration approved and attached to Truck T-9");
  await expect(page).toHaveURL(new RegExp(`/${account.slug}/documents$`));
  const unit = await viaApp<{ registration_expiry: string }>(page, "GET", `/vehicles/${truck.id}`);
  expect(unit.registration_expiry).toBe("2027-11-30");
});
