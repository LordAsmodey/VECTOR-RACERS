import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getBackendBaseUrl } from "@/lib/api/backend-url";
import { AUTH_COOKIE_NAMES } from "@/lib/auth/cookies";

export async function GET(): Promise<NextResponse> {
  const token = cookies().get(AUTH_COOKIE_NAMES.accessToken)?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendBaseUrl()}/catalog/tracks`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const body: unknown = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
