import { NextResponse } from "next/server";

export const AUTH_COOKIE_NAMES = {
  accessToken: "vr_access_token",
  refreshToken: "vr_refresh_token",
} as const;

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface SetAuthCookiesOptions {
  rememberMe: boolean;
}

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setAuthCookies(
  response: NextResponse,
  tokens: AuthTokens,
  options: SetAuthCookiesOptions,
): void {
  response.cookies.set(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
    ...BASE_COOKIE_OPTIONS,
    // rememberMe=false keeps access token session-scoped as well.
    ...(options.rememberMe ? { maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS } : {}),
  });

  response.cookies.set(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
    ...BASE_COOKIE_OPTIONS,
    // rememberMe=true keeps both tokens across browser restarts.
    // rememberMe=false enforces strict session mode for both tokens.
    ...(options.rememberMe
      ? { maxAge: REFRESH_TOKEN_REMEMBER_ME_MAX_AGE_SECONDS }
      : {}),
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete(AUTH_COOKIE_NAMES.accessToken);
  response.cookies.delete(AUTH_COOKIE_NAMES.refreshToken);
}
