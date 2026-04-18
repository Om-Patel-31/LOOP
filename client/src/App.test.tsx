import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  login: vi.fn(async () => {
    throw new Error("no session");
  }),
  register: vi.fn(async () => {
    throw new Error("no session");
  }),
  refresh: vi.fn(async () => {
    throw new Error("no refresh");
  }),
  me: vi.fn(async () => {
    throw new Error("no auth");
  }),
  logout: vi.fn(async () => undefined),
  setAuthToken: vi.fn(),
}));

import App from "./App";

describe("App", () => {
  it("renders auth gate when no user session exists", async () => {
    render(<App />);

    expect(await screen.findByText("Welcome Back")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });
});
