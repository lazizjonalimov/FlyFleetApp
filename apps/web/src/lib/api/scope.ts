// Which company's workspace the tab is in: a company's address segment, or "all" for every company the person can
// open. Set by the workspace when it mounts. Every API request then carries it as X-Company; reads of a list go to
// the API's /all/... resource, and a request about one record goes to that record's own company.
let scope: string | null = null;

export function setScope(value: string | null): void {
  scope = value;
}

export function currentScope(): string | null {
  return scope;
}

// Lists the API can answer for several companies at once, and the dashboard's summary, figures and schedule. Everything else is
// per company. Only these exact addresses are combined: a request for one record never is.
const COMBINED = /^\/api\/v1\/(customers|drivers|vehicles|trailers|loads|invoices|owners|documents|tasks|settlements|owner-settlements|maintenance\/inspections|maintenance\/work-orders|expenses|incidents|payments|dashboard\/summary|dashboard\/kpis|dashboard\/schedule)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Which company each record seen in a combined list belongs to, so what is done to it later (open it, an action
// from its row) is asked of that company, under the person's role there.
const owners = new Map<string, string>();

export function noteRecords(items: readonly { id?: string; organization?: { slug: string } }[]): void {
  for (const item of items) if (item.id && item.organization?.slug) owners.set(item.id, item.organization.slug);
}

/** The company a record belongs to, when it was seen in a combined list. */
export function companyOfRecord(...ids: unknown[]): string | null {
  for (const id of ids) if (typeof id === "string" && owners.has(id)) return owners.get(id)!;
  return null;
}

/** The company a request should be made in, and the address to use. */
export function scopedRequest(pathname: string, method: string): { company: string; path: string } {
  const here = scope ?? "";
  if (scope !== "all") return { company: here, path: pathname };
  const record = pathname.split("/").map((part) => (UUID.test(part) ? owners.get(part) : undefined)).find(Boolean);
  if (record) return { company: record, path: pathname };
  if (method === "GET" && COMBINED.test(pathname)) return { company: "all", path: pathname.replace("/api/v1/", "/api/v1/all/") };
  return { company: "all", path: pathname };
}
