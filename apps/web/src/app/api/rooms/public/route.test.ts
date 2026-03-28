// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import { GET } from "@/app/api/rooms/public/route";

describe("GET /api/rooms/public", () => {
  it("forwards query string to backend without Authorization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
      }),
    );
    process.env.API_URL = "http://api.example.com";

    const request = new NextRequest("http://localhost/api/rooms/public?page=2&limit=10");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ items: [], page: 1, limit: 20, total: 0 });
    expect(fetch).toHaveBeenCalledWith("http://api.example.com/rooms/public?page=2&limit=10", {
      method: "GET",
      cache: "no-store",
    });
  });
});
