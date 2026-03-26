import { z } from "zod";

import { loginSchema, registerSchema } from "@/lib/auth/schemas";

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface AuthSuccessResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface AuthErrorResponse {
  message: string;
  code?: string;
  fieldErrors?: Partial<Record<keyof RegisterRequest, string[]>>;
}
