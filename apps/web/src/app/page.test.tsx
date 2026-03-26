import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home page", () => {
  it("contains links to login and register pages", () => {
    render(<Home />);

    expect(
      screen.getByRole("link", { name: /Login/i }),
    ).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: /Register/i }),
    ).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
