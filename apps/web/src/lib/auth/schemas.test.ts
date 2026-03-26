import { describe, expect, it } from "vitest";

import { AUTH_VALIDATION_MESSAGES } from "@/lib/auth/constants";
import { loginSchema, registerSchema } from "@/lib/auth/schemas";

describe("auth schemas", () => {
  it("normalizes login email to lowercase and trims spaces", () => {
    const result = loginSchema.parse({
      email: "Test@Example.COM",
      password: "password-123",
      rememberMe: true,
    });

    expect(result.email).toBe("test@example.com");
  });

  it("returns validation error for too-short password", () => {
    const parsed = loginSchema.safeParse({
      email: "test@example.com",
      password: "short",
      rememberMe: false,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(AUTH_VALIDATION_MESSAGES.passwordTooShort);
    }
  });

  it("validates register schema and trims username", () => {
    const result = registerSchema.parse({
      username: "  neon-driver  ",
      email: "Pilot@example.com",
      password: "long-enough-password",
      rememberMe: false,
    });

    expect(result.username).toBe("neon-driver");
    expect(result.email).toBe("pilot@example.com");
  });
});
