import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { live, open, PASSWORD, signIn, signUp, unique, viaApp } from "./helpers";

/** The code an authenticator app would show now for this setup key (RFC 6238, 6 digits, 30 seconds). */
function totp(setupKey: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of setupKey.replace(/\s/g, "")) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function openSecurity(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Security & privacy" }).click();
  await page.waitForURL(/\/settings\/security$/);
}

test("Security & privacy: required two-step verification, password rules, a reset link, and signing in with a code", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "dashboard");
  await openSecurity(page);

  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Settings\s*Security & privacy/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Security & privacy");
  const list = page.getByRole("navigation", { name: "Settings sections" });
  await expect(list.getByRole("button").first()).toHaveText("Profile & preferences");
  await expect(list.getByRole("button").nth(1)).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Security checkup")).toContainText("Required for your role");

  // The Main Admin must use two-step verification: the switch is on and can't be changed.
  const master = page.getByRole("button", { name: "Two-step verification", exact: true });
  await expect(master).toHaveAttribute("aria-pressed", "true");
  await expect(master).toBeDisabled();

  // Set up the authenticator app with a real code.
  await page.getByRole("button", { name: "Set up" }).click();
  const setup = page.getByRole("group", { name: "Set up an authenticator app" });
  const qr = setup.getByRole("img", { name: /QR code/ });
  await expect(qr).toBeVisible();
  // drawn, not a broken image
  await expect.poll(() => qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const key = await setup.getByLabel("Setup key").innerText();
  const code = setup.getByLabel("2. Enter the 6-digit code it shows");
  await expect(code).toHaveAttribute("inputmode", "numeric");
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await code.fill(totp(key));
  await setup.getByRole("button", { name: "Verify and save" }).click();
  await expect(page.locator(".toastw")).toContainText("Authenticator app verified");
  const codesButton = page.getByRole("button", { name: "Hide codes" });
  await expect(codesButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(10);
  await codesButton.click();
  await expect(page.getByRole("button", { name: "Show codes" })).toHaveAttribute("aria-expanded", "false");

  // Password: the button waits for every rule, in words as well as colour.
  const update = page.getByRole("button", { name: "Update password" });
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill("short");
  await expect(page.getByRole("list", { name: "Password requirements" })).toContainText("At least 12 charactersNot met");
  await expect(update).toBeDisabled();
  const fresh = "Fresh-Password-2031";
  await page.getByLabel("New password", { exact: true }).fill(fresh);
  await expect(page.getByText("Strength: Strong")).toBeVisible();
  await page.getByLabel("Confirm new password").fill("Fresh-Password-203");
  await expect(page.getByText("Passwords don’t match yet")).toBeVisible();
  await expect(update).toBeDisabled();
  await page.getByLabel("Confirm new password").fill(fresh);
  await expect(page.getByText("Passwords match")).toBeVisible();
  await update.click();
  await expect(page.locator(".toastw")).toContainText("Password updated · other sessions signed out");
  await expect(page.getByLabel("Current password")).toHaveValue("");

  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.locator(".toastw")).toContainText(`Reset link sent to ${account.email}`);
  await expect(page.getByRole("list", { name: "Recent sign-ins" })).toContainText("Signed in");

  // Signing in again asks for the second step.
  await page.context().clearCookies();
  await signIn(page, account.email, fresh);
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".authcard").getByRole("alert")).toContainText("isn’t right");
  await page.getByLabel("Code").fill(totp(key));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/dashboard$/);
});

test("Security & privacy opens for a dispatcher, who can turn two-step verification on and off", async ({ page, browser }) => {
  await signUp(page);
  const email = `${unique("dee")}@example.com`;
  await viaApp(page, "POST", "/members", { email, full_name: "Dee Dispatcher", password: PASSWORD, role: "dispatcher" });
  const dispatcher = await browser.newPage();
  await signIn(dispatcher, email);
  await dispatcher.waitForURL(/\/dashboard$/);
  await live(dispatcher);
  await openSecurity(dispatcher);
  await expect(dispatcher.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Security & privacy" })).toHaveAttribute("aria-current", "page");

  const master = dispatcher.getByRole("button", { name: "Two-step verification", exact: true });
  await expect(master).toHaveAttribute("aria-pressed", "false");
  await expect(dispatcher.getByText("Two-step verification is off. Anyone with your password can sign in.")).toBeVisible();
  await expect(dispatcher.getByText("Authenticator app")).toHaveCount(0);
  await master.click();
  const setup = dispatcher.getByRole("group", { name: "Set up an authenticator app" });
  const key = await setup.getByLabel("Setup key").innerText();
  await setup.getByLabel("2. Enter the 6-digit code it shows").fill(totp(key));
  await setup.getByRole("button", { name: "Verify and save" }).click();
  await expect(dispatcher.locator(".toastw")).toContainText("Authenticator app verified");
  await expect(master).toBeEnabled();
  await master.click();
  await dispatcher.getByRole("dialog", { name: "Turn off two-step verification?" }).getByRole("button", { name: "Turn off" }).click();
  await expect(master).toHaveAttribute("aria-pressed", "false");

  // Privacy choices are switches that say whether they're on.
  const support = dispatcher.getByRole("button", { name: "Let FlyFleet Support view my account" });
  await support.click();
  await expect(support).toHaveAttribute("aria-pressed", "true");
  await dispatcher.getByRole("button", { name: "Request export" }).click();
  await expect(dispatcher.locator(".toastw")).toContainText("Your data export is being prepared");
});
