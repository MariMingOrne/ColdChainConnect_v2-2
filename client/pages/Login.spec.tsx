// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Login } from "./Login";

const fetchMock = vi.fn();

function showLogin() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Signed in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "test-user" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

function response(ok: boolean, body: object) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useAuth.setState({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null });
  vi.unstubAllGlobals();
});

describe("sign-in feedback", () => {
  it("shows the database lookup failure in the login form", async () => {
    const error = "Sign-in database error while looking up the account. The database rejected its connection credentials. Contact an administrator.";
    fetchMock.mockResolvedValue(response(false, { error }));
    showLogin();
    submitCredentials();
    expect((await screen.findByRole("alert")).textContent).toBe(error);
  });

  it("keeps invalid credentials distinct from database errors", async () => {
    fetchMock.mockResolvedValue(response(false, { error: "Invalid credentials" }));
    showLogin();
    submitCredentials();
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password");
  });

  it("shows MFA setup database failures on the login form", async () => {
    const error = "Sign-in database error while saving MFA setup. Please try again later.";
    fetchMock
      .mockResolvedValueOnce(response(true, { mfa: "setup", challenge_token: "challenge" }))
      .mockResolvedValueOnce(response(false, { error }));
    showLogin();
    submitCredentials();
    expect((await screen.findByRole("alert")).textContent).toBe(error);
  });

  it("shows MFA verification database failures on the verification form", async () => {
    const error = "Sign-in database error while loading MFA verification. Please try again later.";
    fetchMock
      .mockResolvedValueOnce(response(true, { mfa: "verify", challenge_token: "challenge" }))
      .mockResolvedValueOnce(response(false, { error }));
    showLogin();
    submitCredentials();
    const code = await screen.findByLabelText("Authentication code");
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(error)).toBeTruthy();
  });

  it("still signs in successfully when credentials are valid", async () => {
    fetchMock.mockResolvedValue(response(true, {
      token: "token",
      user: { id: "test-user", username: "test-user", role: "admin" },
    }));
    showLogin();
    submitCredentials();
    expect(await screen.findByText("Signed in")).toBeTruthy();
  });
});
