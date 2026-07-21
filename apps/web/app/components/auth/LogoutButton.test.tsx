import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, fireEvent, within, cleanup, waitFor } from "@testing-library/react";
import { LogoutButton } from "./LogoutButton";

const pushMock = mock(() => {});
const logoutMock = mock(async () => {});

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

mock.module("@/context/AuthContext", () => ({
  useAuth: () => ({ logout: logoutMock }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  logoutMock.mockClear();
});

describe("LogoutButton", () => {
  test("klik logout memanggil logout() dan redirect ke /login", async () => {
    const { container } = render(<LogoutButton />);
    const screen = within(container);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });

  test("tetap redirect ke /login meski logout() API gagal", async () => {
    logoutMock.mockImplementationOnce(() => {
      throw new Error("Network error");
    });

    const { container } = render(<LogoutButton />);
    const screen = within(container);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });

  test("button disabled selama proses logout berlangsung", async () => {
    let resolveLogout: () => void;
    logoutMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        })
    );

    const { container } = render(<LogoutButton />);
    const screen = within(container);

    const button = screen.getByRole("button") as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalled();
      expect(button.disabled).toBe(true);
    });

    resolveLogout!();

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
  });

  test("menerima custom children & className", () => {
    const { container } = render(
      <LogoutButton className="custom-class">Keluar Sekarang</LogoutButton>
    );
    const screen = within(container);

    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Keluar Sekarang");
    expect(button.className).toBe("custom-class");
  });
});