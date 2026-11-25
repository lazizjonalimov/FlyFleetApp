import { cookies } from "next/headers";
import { apiFetch, clearSession, errorResponse, sameOrigin, sessionToken } from "@/lib/auth/server";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse(403, "FORBIDDEN", "Cross-origin request blocked");
  // The API ends this device's session at once, so a copy of the token is useless too. The cookie goes either way.
  const token = await sessionToken();
  if (token) await apiFetch("/auth/logout", { method: "POST", token }).catch(() => undefined);
  clearSession(await cookies(), request);
  return new Response(null, { status: 204 });
}
