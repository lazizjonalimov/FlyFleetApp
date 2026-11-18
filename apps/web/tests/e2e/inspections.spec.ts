import { expect, test } from "@playwright/test";
import { day, open, qualify, signUp, viaApp } from "./helpers";

test("inspections: a roadside report from the driver app is scored, reviewed, and its violation sent to the shop", async ({ page }) => {
  const account = await signUp(page);
  const papers = { registration_expiry: day(400), insurance_expiry: day(400), inspection_expiry: day(400) };
  const truck = await viaApp<{ id: string }>(page, "POST", "/vehicles", { unit_number: "T-1121", ...papers });
  const trailer = await viaApp<{ id: string }>(page, "POST", "/trailers", { unit_number: "TR-5301", type: "dry_van", ...papers });
  const driver = await viaApp<{ id: string }>(page, "POST", "/drivers", { first_name: "Jamal", last_name: "Carter", cdl_expiry: day(900), medical_cert_expiry: day(900) });
  await qualify(page, driver.id);
  await viaApp(page, "POST", "/maintenance/inspections", {
    kind: "roadside", level: 1, source: "driver_app", vehicle_id: truck.id, trailer_id: trailer.id, driver_id: driver.id,
    inspected_on: day(-1), result: "out_of_service", report_number: "TX-26-0417", location: "Hillsboro, TX",
    defects: [
      { item: "Tire flat or audible air leak", code: "393.75(a)(3)", against: "trailer", severity: "out_of_service" },
      { item: "Clamp-type brake out of adjustment", code: "393.47(e)", against: "vehicle", severity: "major" },
      { item: "Inoperable required lamp", code: "393.9(a)", against: "trailer", severity: "minor" },
    ],
  });

  await open(page, account, "inspections");
  await expect(page.locator(".kpi", { hasText: "Inspections · 24 months" })).toContainText("0 clean · 1 with violations");
  await expect(page.locator(".kpi", { hasText: "Vehicle out-of-service rate" })).toContainText("1 of 1 · above national avg");
  await expect(page.locator(".kpi", { hasText: "Waiting for review" })).toContainText("Sent from the driver app");
  const banner = page.locator(".banner", { hasText: "TX-26-0417 needs review" });
  await expect(banner).toContainText("a trailer was put out of service");
  await expect(banner).toContainText("3 violations read from Jamal Carter’s photos, 20 severity points");
  const row = page.locator(".tb2 .trow", { hasText: "TX-26-0417" });
  await expect(row).toContainText("Level I");
  await expect(row).toContainText("T-1121 · TR-5301");
  await expect(row).toContainText("20");
  await expect(row).toContainText("Needs review");

  // The report: each violation with its unit, BASIC and points; reviewed; the tire sent to the shop.
  await banner.getByRole("button", { name: "Review report" }).click();
  const dialog = page.getByRole("dialog", { name: /TX-26-0417/ });
  const tire = dialog.locator(".vcard", { hasText: "393.75(a)(3)" });
  await expect(tire).toContainText("Trailer TR-5301");
  await expect(tire).toContainText("Vehicle Maintenance · 10 points incl. 2 out of service");
  await tire.getByRole("button", { name: "Open work order" }).click();
  await expect(page.locator(".toastw")).toContainText("opened for Trailer TR-5301");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.locator(".toastw")).toContainText("Inspection reviewed");
  await expect(row).toContainText("Reviewed");
});
