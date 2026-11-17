import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";
import { textPdf, validVin } from "./pdf";

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

test("the trucks table: filter by make, change status in bulk, hide a column, export", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/vehicles", { unit_number: "901", make: "Volvo", year: 2022, vin: "4V4NC9EH5NN000901", ...PAPERS });
  await viaApp(page, "POST", "/vehicles", { unit_number: "902", make: "Volvo", year: 2023, ...PAPERS });
  await viaApp(page, "POST", "/vehicles", { unit_number: "903", make: "Mack", year: 2021, ...PAPERS });
  await open(page, account, "equipment/trucks");
  await expect(page.locator(".kpis")).toContainText("Owned by outside owners");

  await page.getByRole("button", { name: "Filter by make" }).click();
  await page.getByRole("option", { name: /Volvo/ }).click();
  await expect(page.getByRole("button", { name: "Remove filter Make: Volvo" })).toBeVisible();
  await expect(page.locator(".tb2 .trow")).toHaveCount(2);

  await page.locator(".trow", { hasText: "901" }).locator(".chk").click();
  await page.locator(".trow", { hasText: "902" }).locator(".chk").click();
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog", { name: "Change the status of 2 trucks" });
  await dialog.getByRole("radio", { name: "In the shop" }).click();
  await dialog.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByRole("status")).toContainText("2 trucks · status changed");
  await expect(page.locator(".trow", { hasText: "901" })).toContainText("In the shop");

  await page.getByRole("button", { name: "Remove filter Make: Volvo" }).click();
  await expect(page.locator(".tb2 .trow")).toHaveCount(3);
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("group", { name: "Columns" }).getByText("VIN", { exact: true }).click();
  await page.reload();
  await expect(page.locator(".thead")).not.toContainText("VIN");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^vehicles-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("a truck from its registration PDF: read, checked, saved with the registration filed", async ({ page }) => {
  const account = await signUp(page);
  const vin = validVin("3AKJHHDR", "PSNA4417");
  const pdf = textPdf([[[40, 740, "VEHICLE REGISTRATION"], [40, 690, "Plate: S9K 4416"], [300, 690, "State: TEXAS"], [450, 690, "Expires: 11/30/27"],
    [40, 650, "Vehicle identification number"], [40, 636, vin], [40, 600, "Year 2023"], [160, 600, "Make FRHT"], [300, 600, "Model CASCADIA 126"]]]);
  await open(page, account, "equipment/trucks");
  await page.getByRole("button", { name: "Add truck" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Scan the registration/ }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), dialog.getByRole("button", { name: "Upload", exact: true }).click()]);
  await chooser.setFiles({ name: "registration.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(dialog).toContainText("registration.pdf");
  await dialog.getByRole("button", { name: "Read it" }).click();
  const review = page.getByRole("dialog", { name: "Check what we read" });
  await expect(review).toContainText("VIN decoded");
  await expect(review.getByRole("textbox", { name: "VIN", exact: true })).toHaveValue(vin);
  await expect(review.getByRole("textbox", { name: "Plate", exact: true })).toHaveValue("S9K 4416");
  await review.getByRole("textbox", { name: "Unit number", exact: true }).fill("T-501");
  await review.getByRole("textbox", { name: "Plate", exact: true }).fill("S9K 4415");
  await review.getByRole("button", { name: "Create truck" }).click();
  await expect(page.getByRole("heading", { name: "T-501", level: 1 })).toBeVisible();
  await expect(page.locator(".card", { hasText: "Documents" })).toContainText("Registration");
  await expect(page.locator(".main")).toContainText("Freightliner");
});

test("trucks from a CSV: columns matched, a bad VIN caught, the rest imported", async ({ page }) => {
  const account = await signUp(page);
  const good = validVin("1XKYD49X", "EJ123401");
  const bad = `${good.slice(0, 8)}${good[8] === "1" ? "2" : "1"}${good.slice(9)}`;
  const csv = `Unit #,VIN,Year,Make,Plate,St,Plate Exp,Notes\nT-2001,${good},2023,KW,R4K 3001,TX,03/31/2027,new\nT-2002,${bad},2022,Volvo,R4K 3002,TX,03/31/2027,\n`;
  await open(page, account, "equipment/trucks");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import trucks" });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), dialog.getByRole("button", { name: "Choose a file" }).click()]);
  await chooser.setFiles({ name: "trucks.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(dialog).toContainText("7 of 8 columns matched");
  await expect(dialog.getByLabel("FlyFleet field for St")).toHaveValue("plate_state");
  await dialog.getByRole("button", { name: "Check 2 rows" }).click();
  await expect(dialog).toContainText("VIN fails the check digit");
  await dialog.getByRole("button", { name: "Import 1 truck" }).click();
  await expect(dialog).toContainText("1 truck imported");
  await dialog.getByRole("button", { name: "Open trucks" }).click();
  await expect(page.locator(".tb2")).toContainText("T-2001");
  await expect(page.locator(".tb2")).not.toContainText("T-2002");
});
