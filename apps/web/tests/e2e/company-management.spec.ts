import { expect, test, type Page } from "@playwright/test";
import { live, signUp, viaApp } from "./helpers";

const mcNumber = () => String(Date.now() + Math.floor(Math.random() * 1000)).slice(-6);

async function openSwitcher(page: Page) {
  await page.getByRole("button", { name: "Switch company" }).click();
  return page.getByRole("menu", { name: "Switch company" });
}

test("adding a company with the wizard, then managing it on the Companies page", async ({ page }) => {
  const account = await signUp(page, "Acme Trucking");
  const mc = mcNumber();

  // The switcher offers Add a company with how many of the ten are used.
  const menu = await openSwitcher(page);
  await expect(menu.getByRole("menuitem", { name: /Add a company/ })).toContainText("1 of 10 used");
  await menu.getByRole("menuitem", { name: /Add a company/ }).click();
  const dialog = page.getByRole("dialog", { name: "Add a company" });
  await expect(dialog.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(3);
  await expect(dialog.getByRole("radio", { name: /Create a new company/ })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Details: a live mark from the initials, the MC checked, a colour from a named radiogroup.
  const cont = dialog.getByRole("button", { name: "Continue" });
  await dialog.getByLabel("Legal company name").fill("Bravo Freight Lines");
  await expect(dialog.getByText("BFL", { exact: true })).toBeVisible();
  await dialog.getByLabel("MC number").fill(mc);
  await expect(dialog.getByText("Not checked with FMCSA")).toBeVisible();
  await dialog.getByLabel("Home state").selectOption("TX");
  await expect(cont).toBeDisabled();
  await dialog.getByLabel("Fleet size").selectOption("6-20");
  await dialog.getByRole("radiogroup", { name: "Company colour" }).getByRole("radio", { name: "Teal" }).click();
  await expect(dialog.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
  await cont.click();

  // Review, with teammates to invite, then create: you are its Main Admin, and you are in it.
  await expect(dialog).toContainText(`MC-${mc}`);
  await dialog.getByLabel(/Invite teammates/).fill("not-an-email");
  await expect(dialog.getByRole("button", { name: "Create company" })).toBeDisabled();
  await dialog.getByLabel(/Invite teammates/).fill("teammate@example.com");
  await dialog.getByRole("button", { name: "Create company" }).click();
  await expect(page.locator(".toastw")).toContainText("Bravo Freight Lines created · you are its Main Admin");
  await expect(page.getByRole("button", { name: "Switch company" })).toContainText("Bravo Freight Lines");

  // The same MC can't be used twice: it says to ask for an invitation.
  const again = await openSwitcher(page);
  await again.getByRole("menuitem", { name: /Add a company/ }).click();
  const second = page.getByRole("dialog", { name: "Add a company" });
  await second.getByRole("button", { name: "Continue" }).click();
  await second.getByLabel("MC number").fill(mc);
  await expect(second.getByText("Ask its Main Admin to invite you.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(second).toHaveCount(0);

  // Manage companies: Settings › Account › Companies, with Settings marked in the sidebar.
  const manage = await openSwitcher(page);
  await manage.getByRole("menuitem", { name: "Manage companies" }).click();
  await page.waitForURL(/\/settings\/account\/companies$/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(/Administration\s*Settings\s*Account\s*Companies/);
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: /^Settings/ }).first()).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Summary")).toContainText("2 of 10 used · 8 left");
  await expect(page.getByRole("tab", { name: /Active/ })).toContainText("2");

  // Choosing a row shows it; make the other company the default, then open it.
  const acme = page.getByRole("button", { name: /^Acme Trucking:/ });
  await acme.click();
  await expect(acme).toHaveAttribute("aria-pressed", "true");
  const detail = page.getByRole("complementary", { name: "Acme Trucking details" });
  await detail.getByRole("button", { name: "Make default" }).click();
  await expect(page.locator(".toastw")).toContainText("Acme Trucking opens first when you sign in");
  await detail.getByRole("button", { name: "Open company" }).click();
  await page.waitForURL(new RegExp(`/${account.slug}/settings/account/companies$`));
  await expect(page.locator(".toastw")).toContainText("Switched to Acme Trucking, same page");

  // Archive the new company: type its name to confirm; it moves to Archived, read-only, restorable.
  await page.getByRole("button", { name: /^Bravo Freight Lines:/ }).click();
  await page.getByRole("button", { name: "Archive company…" }).click();
  const archive = page.getByRole("dialog", { name: "Archive Bravo Freight Lines?" });
  await expect(archive).toContainText("It still counts toward your 10-company limit.");
  await expect(archive.getByRole("button", { name: "Archive company" })).toBeDisabled();
  await archive.getByLabel("Type Bravo Freight Lines to confirm").fill("Bravo Freight Lines");
  await archive.getByRole("button", { name: "Archive company" }).click();
  await expect(page.locator(".toastw")).toContainText("Bravo Freight Lines archived");
  await page.getByRole("tab", { name: /Archived/ }).click();
  await expect(page.getByRole("region", { name: "Bravo Freight Lines" })).toContainText("Read-only");
  await page.getByRole("region", { name: "Bravo Freight Lines" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.locator(".toastw")).toContainText("Bravo Freight Lines restored");
});

test("joining with a code, accepting an invitation, and leaving: for a role without Settings access", async ({ page, browser }) => {
  const owner = await signUp(page, "Acme Trucking");
  const otherPage = await browser.newPage();
  const other = await signUp(otherPage, "Delta Hauling");

  // A code from an invitation: the company, role and inviter show before joining.
  const invite = await viaApp<{ code: string }>(page, "POST", "/invitations", { email: other.email, full_name: "Dana", role: "dispatcher" });
  const menu = await openSwitcher(otherPage);
  await menu.getByRole("menuitem", { name: /Add a company/ }).click();
  const dialog = otherPage.getByRole("dialog", { name: "Add a company" });
  await dialog.getByRole("radio", { name: /Join a company/ }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("button", { name: "Join company" })).toBeDisabled();
  await dialog.getByLabel("Invitation code").fill(invite.code.toLowerCase());
  await expect(dialog.getByRole("status")).toContainText("Invited by Olive Owner as Dispatcher");
  await dialog.getByRole("button", { name: "Join company" }).click();
  await expect(otherPage.locator(".toastw")).toContainText("You joined Acme Trucking as Dispatcher");
  await otherPage.waitForURL(new RegExp(`/${owner.slug}/dashboard$`));

  // The dispatcher can open the Companies page (it's personal), and leave the company.
  await otherPage.goto(`/${owner.slug}/settings/account/companies`);
  await live(otherPage);
  await expect(otherPage.getByRole("heading", { level: 1 })).toHaveText("Companies");
  const detail = otherPage.getByRole("complementary", { name: "Acme Trucking details" });
  await expect(detail.getByRole("button", { name: "Archive company…" })).toHaveCount(0);
  await detail.getByRole("button", { name: "Leave company…" }).click();
  const leave = otherPage.getByRole("dialog", { name: "Leave Acme Trucking?" });
  await expect(leave).toContainText("You lose access as Dispatcher");
  await leave.getByRole("button", { name: "Leave company" }).click();
  await otherPage.waitForURL(new RegExp(`/${other.slug}/settings/account/companies$`));
  await expect(otherPage.locator(".toastw")).toContainText("You left Acme Trucking · now in Delta Hauling");

  // An invitation to your email waits in the switcher and on the Invitations tab.
  await viaApp(page, "POST", "/invitations", { email: other.email, full_name: "Dana", role: "accountant" });
  await otherPage.reload();
  await live(otherPage);
  const again = await openSwitcher(otherPage);
  await again.getByRole("menuitem", { name: "1 invitation is waiting for you" }).click();
  await expect(otherPage.getByRole("tab", { name: /Invitations/ })).toHaveAttribute("aria-selected", "true");
  const card = otherPage.getByRole("region", { name: "Invitation from Acme Trucking" });
  await expect(card).toContainText("Invited by Olive Owner as Accounting · Expires in 7 days");
  await card.getByRole("button", { name: "Accept" }).click();
  await expect(otherPage.locator(".toastw")).toContainText("You joined Acme Trucking as Accounting");
  await expect(otherPage.getByRole("tab", { name: /Active/ })).toHaveAttribute("aria-selected", "true");
  await expect(otherPage.getByRole("button", { name: /^Acme Trucking:/ })).toHaveAttribute("aria-pressed", "true");

});
