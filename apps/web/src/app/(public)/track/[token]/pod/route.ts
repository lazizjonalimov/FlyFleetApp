import { API_URL } from "@/lib/auth/server";

/** The proof of delivery behind a tracking link, when the carrier chose to share it. No sign-in. */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/public/tracking/${encodeURIComponent(token)}/pod`, { cache: "no-store", redirect: "manual" });
  } catch {
    return new Response("Not reachable right now", { status: 502 });
  }
  if (!upstream.ok) return new Response("No proof of delivery to show", { status: 404 });
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  for (const name of ["content-type", "content-disposition"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}
