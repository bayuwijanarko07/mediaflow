import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { RegisterForm } from "./RegisterForm";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mock(() => {}) }),
}));

mock.module("@/context/AuthContext", () => ({
  useAuth: () => ({ register: mock(async () => {}) }),
}));

afterEach(() => {
  cleanup();
});

describe("RegisterForm", () => {
  test("tampilkan error validasi kalau password < 8 karakter", async () => {
    const { container } = render(<RegisterForm />);
    const screen = within(container);

    fireEvent.change(screen.getByPlaceholderText("email@example.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Masukkan Password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /daftar/i }));

    await waitFor(() => {
      expect(screen.getByText("Password minimal 8 karakter")).toBeDefined();
    });
  });

   test("tampilkan error validasi email tidak valid", async () => {
    const { container } = render(<RegisterForm />);
    const screen = within(container);

    const emailInput = screen.getByPlaceholderText("email@example.com") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "bukan-email" } });

    const passwordInput = screen.getByPlaceholderText("Masukkan Password") as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    fireEvent.click(screen.getByRole("button", { name: /daftar/i }));
    
    await new Promise((resolve) => setTimeout(resolve, 100));

    await waitFor(() => {
      expect(screen.getByText("Format email tidak valid")).toBeDefined();
    });
  });
});