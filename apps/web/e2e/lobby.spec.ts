import { expect, test, type Page } from "@playwright/test";

function sessionCookieUrl(): string {
  const port = process.env.PLAYWRIGHT_PORT ?? "3100";
  return process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
}

async function mockLobbyApis(page: Page, options: { publicItems?: unknown[] } = {}) {
  const { publicItems = [] } = options;

  await page.route("**/api/catalog/cars", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "c1",
          slug: "car-a",
          name: "Car A",
          stats: { speed: 0.8, acceleration: 0.7, grip: 0.6, mass: 0.5 },
          imageUrl: "https://example.com/car-a.png",
          unlockedByDefault: true,
        },
      ]),
    });
  });

  await page.route("**/api/catalog/tracks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "t1",
          slug: "track-1",
          name: "Track 1",
          previewUrl: "https://example.com/track.png",
          lapCount: 3,
          difficulty: "EASY",
        },
      ]),
    });
  });

  await page.route("**/api/rooms/public**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: publicItems,
        page: 1,
        limit: 50,
        total: publicItems.length,
      }),
    });
  });
}

test.describe("lobby", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "vr_access_token",
        value: "playwright-e2e-token",
        url: sessionCookieUrl(),
      },
    ]);
  });

  test("shows car selection after catalog loads", async ({ page }) => {
    await mockLobbyApis(page);

    await page.goto("/lobby");

    await expect(page.getByRole("heading", { name: /Lobby/i })).toBeVisible();
    await expect(page.getByText("Choose your machine")).toBeVisible();
    await expect(page.getByText("Car A")).toBeVisible();
  });

  test("join from public list navigates to room", async ({ page }) => {
    await mockLobbyApis(page, {
      publicItems: [
        {
          id: "room-list-1",
          code: "LIST01",
          status: "WAITING",
          maxPlayers: 4,
          playerCount: 2,
          track: {
            id: "t1",
            slug: "tr",
            name: "Neon Hairpin",
            previewUrl: "https://example.com/thumb.png",
          },
        },
      ],
    });

    await page.route("**/api/rooms/join", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "room-from-list" }),
      });
    });

    await page.goto("/lobby");
    await expect(page.getByText("Neon Hairpin")).toBeVisible();

    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page).toHaveURL("/room/room-from-list");
  });
});
