import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAMES } from "@/lib/auth/cookies";

/**
 * Returns the access JWT for Socket.io `handshake.auth.token`.
 * HttpOnly cookies are not readable from client JS; the game client fetches this route with credentials.
 */
export async function GET(): Promise<NextResponse> {
  const token = cookies().get(AUTH_COOKIE_NAMES.accessToken)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ token });
}
