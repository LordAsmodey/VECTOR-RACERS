import { AUTH_API_ROUTES } from "@/lib/auth/constants";
import type { LoginRequest, RegisterRequest } from "@/lib/auth/types";

type AuthFieldName = "email" | "password" | "username" | "rememberMe";

export interface AuthApiError {
  status: number;
  message: string;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
}

interface RouteErrorPayload {
  message?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
}

interface AuthRouteSuccessResponse {
  success: true;
}

function normalizeAuthApiError(status: number, payload: unknown): AuthApiError {
  const fallbackMessage = "Authentication failed";

  if (!payload || typeof payload !== "object") {
    return {
      status,
      message: fallbackMessage,
    };
  }

  const routeErrorPayload = payload as RouteErrorPayload;
  return {
    status,
    message: routeErrorPayload.message || fallbackMessage,
    fieldErrors: routeErrorPayload.fieldErrors,
  };
}

export function toAuthApiError(error: unknown): AuthApiError {
  if (typeof error !== "object" || error === null) {
    return normalizeAuthApiError(500, {
      message: "Authentication failed",
    });
  }

  const possibleAuthError = error as Partial<AuthApiError>;
  if (typeof possibleAuthError.status === "number" && typeof possibleAuthError.message === "string") {
    return {
      status: possibleAuthError.status,
      message: possibleAuthError.message,
      fieldErrors: possibleAuthError.fieldErrors,
    };
  }

  return normalizeAuthApiError(500, {
    message: "Authentication failed",
  });
}

export function getFirstFieldError(messages?: string[]): string | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  return messages[0] ?? null;
}

async function postToAuthRoute(
  action: string,
  payload: LoginRequest | RegisterRequest,
): Promise<AuthRouteSuccessResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
  } catch {
    throw normalizeAuthApiError(502, {
      message: "Authentication service unavailable",
    });
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw normalizeAuthApiError(response.status, data);
  }

  return (data as AuthRouteSuccessResponse) ?? { success: true };
}

export async function login(input: LoginRequest): Promise<AuthRouteSuccessResponse> {
  const action = AUTH_API_ROUTES.login.replace("/auth/", "");
  return postToAuthRoute(action, input);
}

export async function register(
  input: RegisterRequest,
): Promise<AuthRouteSuccessResponse> {
  const action = AUTH_API_ROUTES.register.replace("/auth/", "");
  return postToAuthRoute(action, input);
}
