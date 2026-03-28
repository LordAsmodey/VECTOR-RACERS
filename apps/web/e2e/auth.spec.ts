import { expect, test } from "@playwright/test";

/** Access cookie so `/lobby` layout (TASK-013) accepts the session after a mocked auth response. */
const MOCK_AUTH_SET_COOKIE = "vr_access_token=playwright-e2e-access; Path=/; SameSite=Lax";

test.describe("auth", () => {
  test("login submits successfully and redirects to /lobby", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": MOCK_AUTH_SET_COOKIE },
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Email").fill("smoke@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/lobby");
  });

  test("register submits successfully and redirects to /lobby", async ({ page }) => {
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": MOCK_AUTH_SET_COOKIE },
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
    await page.getByLabel("Display name").fill("NeonSmoke");
    await page.getByLabel("Email").fill("smoke@example.com");
    await page.getByLabel("Password").first().fill("password123");
    await page.getByLabel("Confirm password").fill("password123");
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL("/lobby");
  });

  test("register shows validation errors and does not call API for invalid form", async ({ page }) => {
    let registerRequests = 0;
    await page.route("**/api/auth/register", async (route) => {
      registerRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/register");
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page.getByText("Username is required")).toBeVisible();
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Password is required" })).toHaveCount(2);

    expect(registerRequests).toBe(0);
    await expect(page).toHaveURL("/register");
  });
});
