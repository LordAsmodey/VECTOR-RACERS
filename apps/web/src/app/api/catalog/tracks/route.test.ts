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

import { GET } from "@/app/api/catalog/tracks/route";

describe("GET /api/catalog/tracks", () => {
  beforeEach(() => {
    cookieRef.value = "test-access-token";
    vi.stubGlobal("fetch", vi.fn());
    process.env.API_URL = "http://api.example.com";
  });

  it("returns 401 when access token cookie is missing", async () => {
    cookieRef.value = undefined;
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("proxies to backend with Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([{ id: "t1", name: "Oval" }]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([{ id: "t1", name: "Oval" }]);
    expect(fetchMock).toHaveBeenCalledWith("http://api.example.com/catalog/tracks", {
      method: "GET",
      headers: { Authorization: "Bearer test-access-token" },
      cache: "no-store",
    });
  });
});
