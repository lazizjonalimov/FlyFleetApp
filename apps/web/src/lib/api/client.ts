import createClient from "openapi-fetch";
import { toApiError } from "@/lib/api/errors";
import { previewTeam } from "@/lib/api/preview";
import { currentScope, scopedRequest } from "@/lib/api/scope";
import type { paths } from "@/lib/api/schema";
import { hardNavigate } from "@/lib/hard-navigation";

/**
 * The browser's API client. Requests go to this app's own origin (/api/v1/...), where the server attaches
 * the session; the browser never holds a token. Paths, parameters and response types all come from the
 * API's OpenAPI contract.
 */
export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin" });

api.use({
  onRequest({ request }) {
    const team = previewTeam();
    if (team) request.headers.set("X-Preview-Team", team);
    if (!currentScope()) return request;
    const url = new URL(request.url);
    const target = scopedRequest(url.pathname, request.method);
    request.headers.set("X-Company", target.company);
    if (target.path === url.pathname) return request;
    url.pathname = target.path;
    return new Request(url, request);
  },
  onResponse({ response }) {
    // The session ended (expired, password changed, access removed): go to sign-in, remembering where we were.
    if (response.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      const next = window.location.pathname + window.location.search;
      hardNavigate(`/login?reason=expired&next=${encodeURIComponent(next)}`);
    }
    return undefined;
  },
});

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Unwrap an openapi-fetch result: the data on success, a thrown ApiError otherwise. */
export async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw toApiError(response.status, error);
  return data as T;
}

/** A fresh key per submission attempt; reusing it on a retry makes the retry safe. */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}
