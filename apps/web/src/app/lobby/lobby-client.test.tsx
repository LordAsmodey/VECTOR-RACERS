import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, replaceMock, routerStub } = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return {
    pushMock: push,
    replaceMock: replace,
    routerStub: { push, replace },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => routerStub,
}));

import { LobbyClient } from "@/app/lobby/lobby-client";

const MOCK_CARS = [
  {
    id: "car-open",
    slug: "open",
    name: "Open Car",
    stats: { speed: 0.9, acceleration: 0.8, grip: 0.7, mass: 0.6 },
    imageUrl: "https://example.com/open.png",
    unlockedByDefault: true,
  },
  {
    id: "car-locked",
    slug: "locked",
    name: "Locked Car",
    stats: { speed: 0.5, acceleration: 0.5, grip: 0.5, mass: 0.5 },
    imageUrl: "https://example.com/locked.png",
    unlockedByDefault: false,
  },
];

const MOCK_TRACKS = [
  {
    id: "tr-1",
    slug: "oval",
    name: "Oval Sprint",
    previewUrl: "https://example.com/t.png",
    lapCount: 3,
    difficulty: "EASY",
  },
];

function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function setupFetchMock(extra?: (url: string) => Promise<Response> | undefined) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const fromExtra = extra?.(url);
    if (fromExtra !== undefined) {
      return fromExtra;
    }
    if (url.includes("/api/catalog/cars")) {
      return jsonResponse(MOCK_CARS);
    }
    if (url.includes("/api/catalog/tracks")) {
      return jsonResponse(MOCK_TRACKS);
    }
    if (url.includes("/api/rooms/public")) {
      return jsonResponse({ items: [], page: 1, limit: 50, total: 0 });
    }
    if (url.includes("/api/rooms/join")) {
      return jsonResponse({ id: "joined-room" });
    }
    if (url.includes("/api/rooms")) {
      return jsonResponse({ id: "new-room" });
    }
    return jsonResponse({ message: "not found" }, 404);
  });
}

describe("LobbyClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = setupFetchMock() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders car grid after catalog loads", async () => {
    render(<LobbyClient />);

    expect(screen.getByText(/Loading lobby/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Choose your machine")).toBeInTheDocument();
    });

    expect(screen.getByText("Open Car")).toBeInTheDocument();
    expect(screen.getByText("Locked Car")).toBeInTheDocument();
  });

  it("disables locked cars and stores selection for unlocked car", async () => {
    const user = userEvent.setup();
    render(<LobbyClient />);

    await screen.findByText("Open Car");

    const locked = screen.getByRole("button", { name: /Locked Car/i });
    expect(locked).toBeDisabled();

    const openBtn = screen.getByRole("button", { name: /Open Car/i });
    await user.click(openBtn);

    expect(localStorage.getItem("vr_lobby_car_id")).toBe("car-open");
  });

  it("opens create room modal", async () => {
    const user = userEvent.setup();
    render(<LobbyClient />);

    await screen.findByText("Open Car");
    await user.click(screen.getByRole("button", { name: /Create Room/i }));

    expect(screen.getByRole("dialog", { name: /Create room/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Track/i)).toBeInTheDocument();
  });

  it("submits create room and navigates to room page", async () => {
    const user = userEvent.setup();
    render(<LobbyClient />);

    await screen.findByText("Open Car");
    await user.click(screen.getByRole("button", { name: /Create Room/i }));
    await user.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/room/new-room");
    });
  });

  it("join by code posts to API and navigates", async () => {
    const user = userEvent.setup();
    render(<LobbyClient />);

    await screen.findByText("Open Car");

    await user.type(screen.getByLabelText(/Room code/i), "AB12CD");
    await user.click(screen.getByRole("button", { name: /Join by Code/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/rooms/join",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "AB12CD", carId: "car-open" }),
        }),
      );
      expect(pushMock).toHaveBeenCalledWith("/room/joined-room");
    });
  });

  it("redirects to login when catalog returns 401", async () => {
    global.fetch = setupFetchMock((url) => {
      if (url.includes("/api/catalog/cars")) {
        return jsonResponse({ message: "Unauthorized" }, 401);
      }
      return undefined;
    }) as unknown as typeof fetch;

    render(<LobbyClient />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login");
    });
  });
});
