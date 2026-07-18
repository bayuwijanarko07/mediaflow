import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup, waitFor } from "@testing-library/react";
import { ProtectedRoute } from "./ProtectedRoute";

const replaceMock = mock(() => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/dashboard",
}));

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
});

describe("ProtectedRoute", () => {
  test("redirect ke /login dengan parameter redirect kalau belum login", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({ isAuthenticated: false, isLoading: false }),
    }));

    const { container } = render(
      <ProtectedRoute>
        <div>Konten Rahasia</div>
      </ProtectedRoute>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?redirect=%2Fdashboard");
    });

    // Konten protected TIDAK BOLEH sempat muncul
    expect(screen.queryByText("Konten Rahasia")).toBeNull();
  });

  test("tidak redirect & tampilkan konten kalau sudah login", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({ isAuthenticated: true, isLoading: false }),
    }));

    const { container } = render(
      <ProtectedRoute>
        <div>Konten Rahasia</div>
      </ProtectedRoute>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Konten Rahasia")).toBeDefined();
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("tampilkan loading state selama isLoading true, tidak langsung redirect", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({ isAuthenticated: false, isLoading: true }),
    }));

    const { container } = render(
      <ProtectedRoute>
        <div>Konten Rahasia</div>
      </ProtectedRoute>
    );
    const screen = within(container);

    expect(screen.getByText("Memuat...")).toBeDefined();
    expect(screen.queryByText("Konten Rahasia")).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});