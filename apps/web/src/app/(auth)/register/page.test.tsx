import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, registerMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  registerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/lib/auth/api", () => ({
  register: registerMock,
  getFirstFieldError: (messages?: string[]) => messages?.[0] ?? null,
  toAuthApiError: (error: unknown) => error,
}));

import RegisterPage from "@/app/(auth)/register/page";

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows mismatch validation for confirm password", async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Display name"), "NeonDriver");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password-123");
    await user.type(screen.getByLabelText("Confirm password"), "password-321");
    const mismatchButton = screen.getAllByRole("button", { name: "Register" })[0];
    const mismatchForm = mismatchButton.closest("form");
    expect(mismatchForm).not.toBeNull();
    fireEvent.submit(mismatchForm as HTMLFormElement);

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
  });

  it("submits valid form and redirects to lobby", async () => {
    registerMock.mockResolvedValue({ success: true });
    render(<RegisterPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Display name"), "NeonDriver");
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password-123");
    await user.type(screen.getByLabelText("Confirm password"), "password-123");
    const submitButton = screen.getAllByRole("button", { name: "Register" })[0];
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        username: "NeonDriver",
        email: "test@example.com",
        password: "password-123",
        rememberMe: false,
      });
      expect(replaceMock).toHaveBeenCalledWith("/lobby");
    });
  });
});
