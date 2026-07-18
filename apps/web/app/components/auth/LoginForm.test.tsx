import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { LoginForm } from "./LoginForm";

const pushMock = mock(() => {});
const loginMock = mock(async () => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

mock.module("@/context/AuthContext", () => ({
  useAuth: () => ({ login: loginMock }),
}));

afterEach(() => {
  cleanup();
});

describe("LoginForm", () => {
  test("tampilkan error validasi kalau email & password kosong", async () => {
    const { container } = render(<LoginForm />);
    const screen = within(container);

    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(screen.getByText("Email wajib diisi")).toBeDefined();
      expect(screen.getByText("Password wajib diisi")).toBeDefined();
    });
  });

  test("tampilkan server error saat login gagal", async () => {
    loginMock.mockImplementationOnce(() => {
      throw new Error("Email atau password salah");
    });

    const { container } = render(<LoginForm />);
    const screen = within(container);

    fireEvent.change(screen.getByPlaceholderText("email@example.com"), {
      target: { value: "test@mediaflow.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Masukkan Password"), {
      target: { value: "salahpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(screen.getByText("Email atau password salah")).toBeDefined();
    });
  });

  test("redirect ke halaman utama setelah login sukses", async () => {
    loginMock.mockImplementationOnce(async () => {});

    const { container } = render(<LoginForm />);
    const screen = within(container);

    fireEvent.change(screen.getByPlaceholderText("email@example.com"), {
      target: { value: "test@mediaflow.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Masukkan Password"), {
      target: { value: "SuperSecret123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/");
    });
  });
});