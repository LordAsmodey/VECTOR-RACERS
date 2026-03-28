import { NextRequest, NextResponse } from "next/server";

import { getBackendBaseUrl } from "@/lib/api/backend-url";

/**
 * Proxies GET /rooms/public (no JWT required on API).
 * Same-origin so the lobby can poll without CORS.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = request.nextUrl.searchParams.toString();
  const path = search ? `/rooms/public?${search}` : "/rooms/public";

  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendBaseUrl()}${path}`, {
      method: "GET",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const body: unknown = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
