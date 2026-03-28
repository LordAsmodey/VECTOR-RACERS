/**
 * Base URL for NestJS API (server-side Route Handlers and RSC).
 * Mirrors logic in `app/api/auth/[...action]/route.ts`.
 */
export function getBackendBaseUrl(): string {
  const fromServer = process.env.API_URL?.trim();
  const fromPublic = process.env.NEXT_PUBLIC_API_URL?.trim();
  const value = fromServer || fromPublic;

  if (!value) {
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:3001";
    }
    throw new Error("API_URL is not configured");
  }

  return value.replace(/\/+$/, "");
}
