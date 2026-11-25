// Shared by the sign-in routes: exchange something for an API token, keep the token in the cookie, and give
// the browser only what it may know.
import "server-only";
import { cookies } from "next/headers";
import { apiFetch, clientHeaders, errorResponse, sameOrigin, sessionToken, setSession, setTrust, TRUST_COOKIE } from "@/lib/auth/server";

type Options = { path: string; authenticated?: boolean };

export async function exchange(request: Request, { path, authenticated = false }: Options): Promise<Response> {
  if (!sameOrigin(request)) return errorResponse(403, "FORBIDDEN", "Cross-origin request blocked");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse(400, "BAD_REQUEST", "Invalid request");

  const token = authenticated ? await sessionToken() : undefined;
  if (authenticated && !token) return errorResponse(401, "UNAUTHENTICATED", "Sign in to continue");

  let upstream: Response;
  try {
    // A browser that passed the second step recently proves it with its trust cookie, and isn't asked again.
    const trust = (await cookies()).get(TRUST_COOKIE)?.value;
    upstream = await apiFetch(path, { method: "POST", token, headers: { "Content-Type": "application/json", ...clientHeaders(request), ...(trust ? { "X-Trusted-Device": trust } : {}) }, body: JSON.stringify(body) });
  } catch {
    return errorResponse(502, "UPSTREAM_UNAVAILABLE", "FlyFleet is not reachable right now. Try again in a moment.");
  }
  const data = await upstream.json().catch(() => null);
  if (!upstream.ok || !data) {
    return data ? Response.json(data, { status: upstream.status }) : errorResponse(502, "UPSTREAM_UNAVAILABLE", "FlyFleet is not reachable right now.");
  }
  if (data.access_token) setSession(await cookies(), request, data.access_token);
  if (data.trusted_device) setTrust(await cookies(), request, data.trusted_device);
  // The token stays on the server. The browser learns which company it is now in, and nothing more.
  return Response.json(
    { organization: data.organization ?? null, organizations: data.organizations ?? [], requires_organization_selection: data.requires_organization_selection ?? false, last_organization_id: data.last_organization_id ?? null, last_scope: data.last_scope ?? "company", requires_second_step: data.requires_second_step ?? false },
    { status: upstream.status, headers: { "Cache-Control": "no-store" } },
  );
}
