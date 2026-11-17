import { expect, test } from "@playwright/test";
import { day, open, signUp, viaApp } from "./helpers";
import { textPdf } from "./pdf";

const PAPERS = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };

/** The quarter a date is in, and the one before, as the screen and the API write them. */
function quarters() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const year = now.getUTCFullYear();
  const prevQ = q === 0 ? 3 : q - 1;
  const prevYear = q === 0 ? year - 1 : year;
  const start = new Date(Date.UTC(prevYear, prevQ * 3, 11)).toISOString().slice(0, 10);
  return { prev: `${prevYear}Q${prevQ + 1}`, prevLabel: `Q${prevQ + 1} ${prevYear}`, prevDay: start };
}

test("a trip by hand, the quarter's rates and a scanned receipt become the return's estimate", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "PATCH", "/organization", { state: "TX" });
  await viaApp(page, "POST", "/vehicles", { unit_number: "T-1", ...PAPERS });
  await open(page, account, "finance/fuel");
  await expect(page.locator(".sub")).toContainText("base jurisdiction Texas");

  await page.getByRole("button", { name: /^Mileage/ }).click();
  await expect(page.locator(".main")).toContainText("No miles for");
  await page.getByRole("button", { name: "Add a trip" }).first().click();
  const trip = page.getByRole("dialog", { name: "Add a trip" });
  await trip.getByRole("button", { name: "Truck: Choose a truck" }).click();
  await trip.getByRole("option", { name: /T-1/ }).click();
  await expect(trip.getByRole("button", { name: "State: Texas" })).toBeVisible();
  await trip.getByLabel("Miles").first().fill("300");
  await trip.getByRole("button", { name: "State: Choose a state" }).click();
  await trip.getByRole("option", { name: /Oklahoma/ }).click();
  await trip.getByLabel("Miles").nth(1).fill("100");
  await trip.getByLabel("Start").fill("1000");
  await trip.getByLabel("End").fill("1300");
  await trip.getByRole("button", { name: "Save trip" }).click();
  await expect(trip).toContainText("The odometer shows 300 mi; the states add up to 400");
  await trip.getByLabel("End").fill("1400");
  await trip.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByRole("status")).toContainText("Trip saved · miles added to T-1 for Texas and Oklahoma");
  const truckRow = page.locator(".trow", { hasText: "T-1" }).first();
  await expect(truckRow).toContainText("Manual");
  await expect(truckRow).toContainText("400");
  await expect(page.locator(".card", { hasText: "Imports & manual trips" })).toContainText("Manual · T-1");

  await page.getByRole("button", { name: /^Tax rates/ }).click();
  await expect(page.locator(".trow", { hasText: "Texas" })).toContainText("No rate");
  await page.getByRole("button", { name: "Edit rates" }).click();
  await page.getByLabel("Diesel rate for Texas").fill("0.2000");
  await page.getByLabel("Diesel rate for Oklahoma").fill("0.1900");
  await page.getByRole("button", { name: "Save rates" }).click();
  await expect(page.getByRole("status")).toContainText("rates saved");
  await expect(page.locator(".trow", { hasText: "Texas" })).toContainText("$0.2000");

  const receipt = textPdf([[[40, 740, "TRAVEL CENTER #432"], [40, 725, "I-35 FRONTAGE RD"], [40, 710, "WACO, TX"], [40, 680, `${day(0).slice(5, 7)}/${day(0).slice(8, 10)}/${day(0).slice(0, 4)} 08:02`],
    [40, 650, "DIESEL #2"], [40, 635, "GALLONS 50.000"], [40, 620, "PRICE/GAL $3.800"], [40, 590, "FUEL TOTAL $190.00"], [40, 575, "UNIT T-1"], [40, 560, "CASH $200.00"]]]);
  await page.getByRole("button", { name: "Scan a receipt" }).first().click();
  await page.getByRole("dialog", { name: "Add a fuel receipt" }).getByRole("button", { name: /Scan the receipt/ }).click();
  const scan = page.getByRole("dialog", { name: "Scan the receipt" });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), scan.getByRole("button", { name: "Upload", exact: true }).click()]);
  await chooser.setFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: receipt });
  await expect(scan).toContainText("receipt.pdf");
  await scan.getByRole("button", { name: "Read it" }).click();
  const review = page.getByRole("dialog", { name: "Check what we read" });
  await expect(review).toContainText("Truck matched");
  await expect(review.getByRole("textbox", { name: "Station", exact: true })).toHaveValue("Travel Center #432");
  await expect(review.getByRole("textbox", { name: "Total", exact: true })).toHaveValue("190.00");
  await expect(review).toContainText("Matches gallons × price");
  await expect(review).toContainText("50.0 gallons counted for Texas in IFTA");
  await review.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByRole("status")).toContainText("Fuel purchase saved");

  await page.getByRole("button", { name: /^Purchases/ }).click();
  await expect(page.locator(".trow", { hasText: "Travel Center #432" })).toContainText("$190.00");
  await expect(page.locator(".card").filter({ has: page.getByRole("heading", { name: "Receipts", exact: true }) })).toContainText("Matched");

  await page.getByRole("button", { name: /^Quarterly returns/ }).click();
  await expect(page.locator(".card", { hasText: "return" }).first()).toContainText("Estimate · still collecting");
  // 400 mi on 50 gal is 8 MPG: Texas's 300 mi are 38 taxable gallons against 50 bought there, a credit;
  // Oklahoma's 100 mi are 12 taxable gallons with none bought there.
  await expect(page.locator(".trow", { hasText: "Texas" })).toContainText("−12");
  await expect(page.locator(".trow", { hasText: "Texas" })).toContainText("($2.40)");
  await expect(page.locator(".trow", { hasText: "Oklahoma" })).toContainText("$2.28");
});

test("mileage from a spreadsheet: the odometer chosen, a bad state skipped, held miles counted", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "POST", "/vehicles", { unit_number: "T-7", ...PAPERS });
  const when = day(-1);
  const csv = Buffer.from(`Truck,Date,State,Miles,Odometer start,Odometer end\nT-7,${when},TX,240,1000,1226\nT-7,${when},XT,90,,\nT-7,${when},OK,100,,\n`);
  await open(page, account, "finance/fuel");
  await page.getByRole("button", { name: "Import mileage" }).click();
  const dialog = page.getByRole("dialog", { name: "Import mileage" });
  await expect(dialog).toContainText("One row is one state on one trip");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), dialog.getByRole("button", { name: "Choose a file" }).click()]);
  await chooser.setFiles({ name: "miles.csv", mimeType: "text/csv", buffer: csv });
  await dialog.getByRole("button", { name: "Check 3 rows" }).click();
  await expect(dialog).toContainText("Miles (240) don't match the odometer (226)");
  await expect(dialog).toContainText("isn't a US state or Canadian province");
  await dialog.getByRole("button", { name: "Use odometer" }).click();
  await expect(dialog.getByRole("button", { name: "Use odometer" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("checkbox", { name: "Hold imported miles for review before the return is approved" })).toBeChecked();
  await dialog.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(dialog).toContainText("2 trip rows imported");
  await expect(dialog).toContainText("Updated · row 2, odometer used");
  await expect(dialog).toContainText("Skipped · row 3");
  await dialog.getByRole("button", { name: "View mileage" }).click();

  const gaps = page.locator(".card", { hasText: "Gaps to review" });
  await expect(gaps).toContainText("2 open");
  await expect(page.locator(".trow", { hasText: "T-7" }).first()).toContainText("2 trips held");
  await gaps.getByRole("button", { name: "Count these miles" }).first().click();
  await expect(gaps).toContainText("1 open");
  await gaps.getByRole("button", { name: "Count these miles" }).click();
  await expect(gaps).toContainText("Nothing to review");
  await expect(page.locator(".trow", { hasText: "T-7" }).first()).toContainText("CSV");
  await expect(page.locator(".trow", { hasText: "T-7" }).first()).toContainText("326");
});

test("last quarter's return is reviewed, approved, filed and paid, and the fuel report shows the trend", async ({ page }) => {
  const account = await signUp(page);
  await viaApp(page, "PATCH", "/organization", { state: "TX" });
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-9", ...PAPERS });
  const { prev, prevLabel, prevDay } = quarters();
  await viaApp(page, "POST", "/ifta/trips", { vehicle_id: truck.id, trip_date: prevDay, miles: [{ jurisdiction: "TX", miles: "1200" }, { jurisdiction: "OK", miles: "800" }] });
  await viaApp(page, "POST", "/expenses", { category: "fuel", incurred_on: prevDay, amount: "1140.00", gallons: "300", jurisdiction: "TX", vehicle_id: truck.id });
  await viaApp(page, "POST", "/expenses", { category: "fuel", incurred_on: prevDay, amount: "126.67", gallons: "33.333", jurisdiction: "OK", vehicle_id: truck.id });
  await viaApp(page, "PUT", `/ifta/rates/${prev}`, { rates: [{ jurisdiction: "TX", rate: "0.2000" }, { jurisdiction: "OK", rate: "0.1900" }] });

  await open(page, account, "finance/fuel");
  await page.getByRole("button", { name: /^Quarterly returns/ }).click();
  await page.getByRole("group", { name: "Quarter" }).getByRole("button", { name: prevLabel }).click();
  const table = page.getByRole("table", { name: `${prevLabel} return` });
  await expect(table.locator(".trow", { hasText: "Texas" })).toContainText("($20.00)");
  await expect(table.locator(".trow", { hasText: "Oklahoma" })).toContainText("$19.00");
  await expect(table.locator(".trow.tot")).toContainText("($1.00) credit");

  await page.getByRole("button", { name: "Start the review" }).click();
  await expect(page.getByRole("status")).toContainText("review started");
  await page.getByRole("button", { name: "Approve the return" }).click();
  await expect(page.locator(".tag", { hasText: "Approved · figures fixed" })).toBeVisible();
  await page.getByLabel("Confirmation number").fill("TX-CONF-1");
  await page.getByRole("button", { name: "Mark filed" }).click();
  await expect(page.locator(".card", { hasText: "Filing status" })).toContainText("TX-CONF-1");
  await page.getByRole("button", { name: "Record the credit" }).click();
  await expect(page.locator(".tag", { hasText: "Paid" })).toBeVisible();
  const history = page.locator(".card", { hasText: `Review & approval · ${prevLabel}` });
  await expect(history).toContainText("approved the return · credit of $1.00");
  await expect(history).toContainText("filed the return · confirmation TX-CONF-1");
  await expect(page.locator(".card", { hasText: "Past returns" })).toContainText(prevLabel);

  await open(page, account, "reports");
  await page.getByRole("navigation", { name: "Report catalog" }).getByRole("button", { name: "Fuel & IFTA" }).click();
  await expect(page.locator(".kpis")).toContainText("Fuel cost per mile");
  await expect(page.locator(".kpis")).toContainText("IFTA net due · estimate");
  await expect(page.getByRole("button", { name: /Last 8 weeks/ })).toBeVisible();
});
