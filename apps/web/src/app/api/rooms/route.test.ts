// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieRef } = vi.hoisted(() => ({
  cookieRef: { value: "test-access-token" as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "vr_access_token" && cookieRef.value
        ? { value: cookieRef.value }
        : undefined,
  }),
}));

import { NextRequest } from "next/server";

import { POST } from "@/app/api/rooms/route";

describe("POST /api/rooms", () => {
  beforeEach(() => {
    cookieRef.value = "test-access-token";
    vi.stubGlobal("fetch", vi.fn());
    process.env.API_URL = "http://api.example.com";
  });

  it("returns 401 without cookie", async () => {
    cookieRef.value = undefined;
    const request = new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      body: JSON.stringify({ trackId: "t", carId: "c", maxPlayers: 4 }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("forwards JSON body and Bearer token", async () => {
    const payload = { trackId: "tr-1", carId: "car-1", maxPlayers: 4 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ id: "room-1", code: "AB12CD" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ id: "room-1", code: "AB12CD" });
    expect(fetchMock).toHaveBeenCalledWith("http://api.example.com/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-access-token",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  });
});
