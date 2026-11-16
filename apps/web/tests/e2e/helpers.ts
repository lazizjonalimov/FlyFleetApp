import { expect, type Page } from "@playwright/test";

// Journeys run against the real stack: PostgreSQL, the API and this app. Each test makes its own company
// through the sign-up screen, so tests never share records and never depend on anything already in the
// database.

export const PASSWORD = "correct horse battery staple";

export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export type Account = { email: string; company: string; slug: string };

/** Waits until the console on the page answers to input: drawn and running in the browser. */
export async function live(page: Page): Promise<void> {
  await expect(page.locator(".ff")).toBeVisible();
  await page.waitForFunction(() => {
    const root = document.querySelector(".ff");
    return root !== null && Object.keys(root).some((key) => key.startsWith("__reactFiber$"));
  });
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0))));
}

/** Creates an account and its first company through the sign-up screen, the way a new customer would. */
export async function signUp(page: Page, company = "Acme Trucking"): Promise<Account> {
  const email = `${unique("owner")}@example.com`;
  await page.goto("/signup");
  await live(page);
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Your name").fill("Olive Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard$/);
  await live(page);
  return { email, company, slug: new URL(page.url()).pathname.split("/")[1]! };
}

/** Signs in through the form. */
export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await live(page);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

/** Opens an address inside the account's workspace and waits for the console. */
export async function open(page: Page, account: Account, path: string): Promise<void> {
  await page.goto(`/${account.slug}/${path.replace(/^\//, "")}`);
  await live(page);
}

/** The sidebar entry for a section. */
export const nav = (page: Page, label: string) =>
  page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}(,|$)`) });

/**
 * Calls the API through the page's own session, exactly as the app does (same origin, same cookie). Used to
 * arrange records quickly; what a test is about is always done through the screen.
 */
export async function viaApp<T = unknown>(page: Page, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const result = await page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(`/api/v1${path}`, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : null };
    },
    { method, path, body },
  );
  if (result.status >= 400) throw new Error(`${method} ${path} → ${result.status}: ${JSON.stringify(result.data)}`);
  return result.data as T;
}

/** A date some days from today, as the API takes dates. */
export const day = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
