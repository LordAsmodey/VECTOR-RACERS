// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clearAuthCookies, setAuthCookies } = vi.hoisted(() => ({
  clearAuthCookies: vi.fn(),
  setAuthCookies: vi.fn(),
}));

vi.mock("@/lib/auth/cookies", () => ({
  clearAuthCookies,
  setAuthCookies,
}));

import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/[...action]/route";

describe("POST /api/auth/[...action]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_URL = "http://api.example.com";
  });

  it("returns 404 for unsupported action", async () => {
    const request = new NextRequest("http://localhost/api/auth/unknown", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: { action: ["unknown"] } });
    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid json", async () => {
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: "{invalid-json",
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request, { params: { action: ["login"] } });
    expect(response.status).toBe(400);
  });

  it("forwards login payload and sets cookies on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "test@example.com",
        password: "password-123",
        rememberMe: true,
      }),
    });

    const response = await POST(request, { params: { action: ["login"] } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith("http://api.example.com/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password-123",
      }),
      cache: "no-store",
    });
    expect(setAuthCookies).toHaveBeenCalledWith(
      expect.anything(),
      { accessToken: "access-token", refreshToken: "refresh-token" },
      { rememberMe: true },
    );
  });

  it("normalizes backend validation errors and clears cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        message: ["email is invalid"],
        error: "Unauthorized",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "wrong", password: "bad" }),
    });

    const response = await POST(request, { params: { action: ["login"] } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({
      message: "email is invalid",
      fieldErrors: { email: ["email is invalid"] },
      code: "Unauthorized",
    });
    expect(clearAuthCookies).toHaveBeenCalledWith(expect.anything());
  });
});
