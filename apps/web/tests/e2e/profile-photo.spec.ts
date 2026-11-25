import { expect, test } from "@playwright/test";
import { live, open, PASSWORD, signIn, signUp, unique, viaApp } from "./helpers";

// A real 48 × 48 PNG: the API reads and re-encodes it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAATElEQVR4nO3OIQHAIAAAQaDIItHfEWV+5iUTdwluPvuMP1m3A19CRagIFaEiVISKUBEqQkWoCBWhIlSEilARKkJFqAgVoSJUhIpQeQGrywGuBHR19wAAAABJRU5ErkJggg==", "base64");

test("a profile photo from the account menu, changed and removed in Profile & preferences", async ({ page }) => {
  const account = await signUp(page);
  await open(page, account, "dashboard");
  const menuButton = page.getByRole("button", { name: "Account menu" });
  await expect(menuButton.locator("img")).toHaveCount(0);

  // From the top bar: the account menu offers to upload one.
  await menuButton.click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Upload profile photo" }).click();
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".toastw")).toContainText("Profile photo updated");
  const avatar = menuButton.locator("img");
  await expect(avatar).toHaveAttribute("src", /\/api\/v1\/auth\/me\/photo\?v=/);
  await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // A file that isn't a picture is refused before it is sent.
  await menuButton.click();
  const another = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Change profile photo" }).click();
  await (await another).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.locator(".toastw")).toContainText("Use a JPEG, PNG or WebP picture");

  // Profile & preferences shows it, and can change or remove it.
  await open(page, account, "settings/profile");
  await expect(page.getByRole("group", { name: "Profile photo" }).getByRole("button", { name: "Change photo" })).toBeVisible();
  await page.getByRole("group", { name: "Profile photo" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".toastw")).toContainText("Profile photo removed");
  await expect(menuButton.locator("img")).toHaveCount(0);
  const fromProfile = page.waitForEvent("filechooser");
  await page.getByRole("group", { name: "Profile photo" }).getByRole("button", { name: "Upload photo" }).click();
  await (await fromProfile).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(menuButton.locator("img")).toHaveCount(1);
});

test("a role without Settings access sets its own photo", async ({ page, browser }) => {
  await signUp(page);
  const email = `${unique("acc")}@example.com`;
  await viaApp(page, "POST", "/members", { email, full_name: "Ana Accounts", password: PASSWORD, role: "accountant" });
  const member = await browser.newPage();
  await signIn(member, email);
  await member.waitForURL(/\/dashboard$/);
  await live(member);
  await member.getByRole("button", { name: "Account menu" }).click();
  const chooser = member.waitForEvent("filechooser");
  await member.getByRole("menuitem", { name: "Upload profile photo" }).click();
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(member.locator(".toastw")).toContainText("Profile photo updated");
  await expect(member.getByRole("button", { name: "Account menu" }).locator("img")).toHaveCount(1);
});
