import { NextRequest, NextResponse } from "next/server";

import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";

const SUPPORTED_ACTIONS = new Set(["login", "register"]);
const AUTH_FIELD_NAMES = ["email", "password", "username", "rememberMe"] as const;
const AUTH_DTO_FIELDS_BY_ACTION = {
  login: ["email", "password"],
  register: ["email", "password", "username"],
} as const;

type AuthFieldName = (typeof AUTH_FIELD_NAMES)[number];

interface BackendErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
}

function resolveApiBaseUrl(): string {
  const fromServer = process.env.API_URL?.trim();
  const fromPublic = process.env.NEXT_PUBLIC_API_URL?.trim();
  const value = fromServer || fromPublic;

  if (!value) {
    throw new Error("API_URL is not configured");
  }

  return value.replace(/\/+$/, "");
}

function normalizeBackendError(payload: unknown): {
  message: string;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
  code?: string;
} {
  const fallbackMessage = "Authentication request failed";

  if (!payload || typeof payload !== "object") {
    return { message: fallbackMessage };
  }

  const backend = payload as BackendErrorPayload;
  if (backend.fieldErrors) {
    return {
      message: typeof backend.message === "string" ? backend.message : fallbackMessage,
      fieldErrors: backend.fieldErrors,
      code: backend.error,
    };
  }

  const fieldErrors: Partial<Record<AuthFieldName, string[]>> = {};
  const globalMessages: string[] = [];
  const rawMessages = Array.isArray(backend.message)
    ? backend.message
    : backend.message
      ? [backend.message]
      : [];

  for (const rawMessage of rawMessages) {
    const message = rawMessage.trim();
    const lowerMessage = message.toLowerCase();
    const matchedField = AUTH_FIELD_NAMES.find((fieldName) =>
      lowerMessage.includes(fieldName.toLowerCase()),
    );

    if (matchedField) {
      const existing = fieldErrors[matchedField] ?? [];
      fieldErrors[matchedField] = [...existing, message];
      continue;
    }

    globalMessages.push(message);
  }

  return {
    message: globalMessages[0] ?? rawMessages[0] ?? fallbackMessage,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    code: backend.error,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: { action?: string[] } },
): Promise<NextResponse> {
  const action = context.params.action?.[0];

  if (!action || !SUPPORTED_ACTIONS.has(action)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid JSON payload" }, { status: 400 });
  }

  const rememberMe = payload.rememberMe === true;
  const apiBaseUrl = resolveApiBaseUrl();
  const dtoFieldNames =
    AUTH_DTO_FIELDS_BY_ACTION[action as keyof typeof AUTH_DTO_FIELDS_BY_ACTION];
  const backendDtoPayload = Object.fromEntries(
    dtoFieldNames.map((fieldName) => [fieldName, payload[fieldName]]),
  );

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${apiBaseUrl}/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backendDtoPayload),
      cache: "no-store",
    });
  } catch {
    const response = NextResponse.json(
      { message: "Authentication service unavailable", code: "UPSTREAM_UNAVAILABLE" },
      { status: 502 },
    );
    clearAuthCookies(response);
    return response;
  }

  let responsePayload: unknown = null;
  try {
    responsePayload = await backendResponse.json();
  } catch {
    responsePayload = null;
  }

  if (!backendResponse.ok) {
    const normalizedError = normalizeBackendError(responsePayload);
    const response = NextResponse.json(normalizedError, {
      status: backendResponse.status,
    });
    clearAuthCookies(response);
    return response;
  }

  const tokens =
    responsePayload &&
    typeof responsePayload === "object" &&
    "accessToken" in responsePayload &&
    "refreshToken" in responsePayload
      ? {
          accessToken: String((responsePayload as { accessToken: string }).accessToken),
          refreshToken: String((responsePayload as { refreshToken: string }).refreshToken),
        }
      : null;

  if (!tokens) {
    return NextResponse.json(
      { message: "Invalid auth response from API" },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ success: true });
  setAuthCookies(response, tokens, { rememberMe });
  return response;
}
