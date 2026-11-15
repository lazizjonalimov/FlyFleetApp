import { NextResponse } from "next/server";
import { allowEmbedding } from "@/lib/auth/embedding";

/**
 * Document security headers, set here (per request) rather than in next.config so that framing can be
 * switched by an environment variable at run time without rebuilding.
 *
 * Everything the browser loads is same-origin (API calls go through /api/v1 on this app), so the policy can
 * be tight. 'unsafe-inline' is what Next.js needs without per-request nonces; a nonce-based policy is a later
 * hardening step. By default the app refuses to be framed by anyone (clickjacking protection).
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  const embeddable = allowEmbedding();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "frame-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    ...(embeddable ? [] : ["frame-ancestors 'none'"]),
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
  if (!embeddable) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

// The console currently runs on the workspace built into it, so there is no session to check here yet. When
// screens read from the API, the sign-in redirect returns to this function.
export function proxy() {
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icon1.png|robots.txt).*)"],
};
