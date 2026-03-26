import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirstFieldError, login, register, toAuthApiError } from "@/lib/auth/api";

describe("auth api helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns first field error or null", () => {
    expect(getFirstFieldError(["first", "second"])).toBe("first");
    expect(getFirstFieldError([])).toBeNull();
    expect(getFirstFieldError()).toBeNull();
  });

  it("normalizes unknown error in toAuthApiError", () => {
    expect(toAuthApiError("error")).toEqual({
      status: 500,
      message: "Authentication failed",
      fieldErrors: undefined,
    });
  });

  it("posts login payload and includes credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await login({
      email: "test@example.com",
      password: "password-123",
      rememberMe: true,
    });

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password-123",
        rememberMe: true,
      }),
      credentials: "include",
    });
  });

  it("maps fetch failure to service unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(
      register({
        username: "driver",
        email: "test@example.com",
        password: "password-123",
        rememberMe: false,
      }),
    ).rejects.toMatchObject({
      status: 502,
      message: "Authentication service unavailable",
    });
  });
});
