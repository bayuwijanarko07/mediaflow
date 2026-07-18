import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

afterEach(() => {
  cleanup();
});

function TestConsumer() {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div>Status: {isAuthenticated ? "authenticated" : "not-authenticated"}</div>
      {user && <div>User: {user.email}</div>}
    </div>
  );
}

describe("AuthProvider - restore sesi saat mount", () => {
  test("sesi ter-restore otomatis kalau refresh sukses", async () => {
    global.fetch = mock(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return new Response(
          JSON.stringify({
            accessToken: "restored-token",
            user: { id: "1", email: "test@mediaflow.dev", name: "Test", isVerified: true },
          }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { container } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    const screen = within(container);

    expect(screen.getByText("Loading...")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Status: authenticated")).toBeDefined();
      expect(screen.getByText("User: test@mediaflow.dev")).toBeDefined();
    });
  });

  test("dianggap belum login kalau refresh gagal (401)", async () => {
    global.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }) as unknown as typeof fetch;

    const { container } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Status: not-authenticated")).toBeDefined();
    });
  });

  test("dianggap belum login kalau network error total", async () => {
    global.fetch = mock(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    const { container } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Status: not-authenticated")).toBeDefined();
    });
  });
});