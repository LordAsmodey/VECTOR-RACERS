import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getBackendBaseUrl } from "@/lib/api/backend-url";
import { AUTH_COOKIE_NAMES } from "@/lib/auth/cookies";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = cookies().get(AUTH_COOKIE_NAMES.accessToken)?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendBaseUrl()}/rooms/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API unavailable" }, { status: 502 });
  }

  const body: unknown = await upstream.json().catch(() => null);
  return NextResponse.json(body, { status: upstream.status });
}
