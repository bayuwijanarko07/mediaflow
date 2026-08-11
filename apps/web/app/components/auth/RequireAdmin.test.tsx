import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup, waitFor } from "@testing-library/react";
import { RequireAdmin } from "./RequireAdmin";

const replaceMock = mock(() => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/admin/upload",
}));

afterEach(() => {
  cleanup();
  replaceMock.mockClear();
});

describe("RequireAdmin", () => {
  test("redirect ke /login dengan parameter redirect kalau belum login", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }),
    }));

    const { container } = render(
      <RequireAdmin>
        <div>Form Admin</div>
      </RequireAdmin>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?redirect=%2Fadmin%2Fupload");
    });

    expect(screen.queryByText("Form Admin")).toBeNull();
  });

  test("redirect ke / kalau sudah login tapi role USER (bukan admin)", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { id: "1", email: "member@mediaflow.dev", name: null, isVerified: true, role: "USER" },
      }),
    }));

    const { container } = render(
      <RequireAdmin>
        <div>Form Admin</div>
      </RequireAdmin>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/");
    });

    // Konten admin TIDAK BOLEH sempat muncul ke member
    expect(screen.queryByText("Form Admin")).toBeNull();
  });

  test("tidak redirect & tampilkan konten kalau role ADMIN", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { id: "2", email: "admin@mediaflow.dev", name: null, isVerified: true, role: "ADMIN" },
      }),
    }));

    const { container } = render(
      <RequireAdmin>
        <div>Form Admin</div>
      </RequireAdmin>
    );
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Form Admin")).toBeDefined();
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("tampilkan loading state selama isLoading true, tidak langsung redirect", async () => {
    mock.module("@/context/AuthContext", () => ({
      useAuth: () => ({ isAuthenticated: false, isLoading: true, user: null }),
    }));

    const { container } = render(
      <RequireAdmin>
        <div>Form Admin</div>
      </RequireAdmin>
    );
    const screen = within(container);

    expect(screen.getByText("Memuat...")).toBeDefined();
    expect(screen.queryByText("Form Admin")).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});