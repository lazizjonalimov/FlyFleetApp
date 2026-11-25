import { apiFetch, clientHeaders, errorResponse, sameOrigin } from "@/lib/auth/server";

// Setting a new password from a reset link. No one is signed in yet; the link's token is the proof. Every
// session is signed out by the API, so the person then signs in with the new password.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse(403, "FORBIDDEN", "Cross-origin request blocked");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse(400, "BAD_REQUEST", "Invalid request");
  let upstream: Response;
  try {
    upstream = await apiFetch("/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json", ...clientHeaders(request) }, body: JSON.stringify(body) });
  } catch {
    return errorResponse(502, "UPSTREAM_UNAVAILABLE", "FlyFleet is not reachable right now. Try again in a moment.");
  }
  if (upstream.status === 204) return new Response(null, { status: 204 });
  const data = await upstream.json().catch(() => null);
  return data ? Response.json(data, { status: upstream.status }) : errorResponse(502, "UPSTREAM_UNAVAILABLE", "FlyFleet is not reachable right now.");
}
