import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, loginMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  loginMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/lib/auth/api", () => ({
  login: loginMock,
  getFirstFieldError: (messages?: string[]) => messages?.[0] ?? null,
  toAuthApiError: (error: unknown) => error,
}));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form and shows validation for invalid email", async () => {
    render(<LoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "invalid-email");
    await user.tab();

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
  });

  it("submits valid form and redirects to lobby", async () => {
    loginMock.mockResolvedValue({ success: true });
    render(<LoginPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password-123");
    const submitButton = screen.getAllByRole("button", { name: "Sign in" })[0];
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password-123",
        rememberMe: false,
      });
      expect(replaceMock).toHaveBeenCalledWith("/lobby");
    });
  });
});
