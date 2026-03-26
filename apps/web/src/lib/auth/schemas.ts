import { z } from "zod";

import { AUTH_FIELD_LIMITS, AUTH_VALIDATION_MESSAGES } from "@/lib/auth/constants";

const emailSchema = z
  .string({ error: AUTH_VALIDATION_MESSAGES.emailRequired })
  .min(1, AUTH_VALIDATION_MESSAGES.emailRequired)
  .max(AUTH_FIELD_LIMITS.emailMaxLength)
  .email(AUTH_VALIDATION_MESSAGES.emailInvalid)
  .transform((value) => value.trim().toLowerCase());

const passwordSchema = z
  .string({ error: AUTH_VALIDATION_MESSAGES.passwordRequired })
  .min(1, AUTH_VALIDATION_MESSAGES.passwordRequired)
  .min(AUTH_FIELD_LIMITS.passwordMinLength, AUTH_VALIDATION_MESSAGES.passwordTooShort)
  .max(AUTH_FIELD_LIMITS.passwordMaxLength, AUTH_VALIDATION_MESSAGES.passwordTooLong);

const usernameSchema = z
  .string({ error: AUTH_VALIDATION_MESSAGES.usernameRequired })
  .trim()
  .min(1, AUTH_VALIDATION_MESSAGES.usernameRequired)
  .min(AUTH_FIELD_LIMITS.usernameMinLength, AUTH_VALIDATION_MESSAGES.usernameTooShort)
  .max(AUTH_FIELD_LIMITS.usernameMaxLength, AUTH_VALIDATION_MESSAGES.usernameTooLong);

const rememberMeSchema = z.boolean().default(false);

export const authFieldSchemas = {
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  rememberMe: rememberMeSchema,
} as const;

export const loginSchema = z.object({
  email: authFieldSchemas.email,
  password: authFieldSchemas.password,
  rememberMe: authFieldSchemas.rememberMe,
});

export const registerSchema = z.object({
  email: authFieldSchemas.email,
  password: authFieldSchemas.password,
  username: authFieldSchemas.username,
  rememberMe: authFieldSchemas.rememberMe,
});
