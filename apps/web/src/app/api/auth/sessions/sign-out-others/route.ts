import { exchange } from "@/lib/auth/session-routes";

// Signing out everywhere else retires every token; this device continues on the fresh one the API returns.
export const POST = (request: Request) => exchange(request, { path: "/auth/sessions/sign-out-others", authenticated: true });
