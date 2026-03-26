import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home page", () => {
  it("contains links to login and register pages", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Go to register" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
