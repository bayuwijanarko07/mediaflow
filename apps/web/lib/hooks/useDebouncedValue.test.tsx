import { describe, expect, test } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  test("nilai berubah setelah delay, bukan langsung", async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } }
    );

    expect(result.current).toBe("a");

    rerender({ value: "ab" });
    // Segera setelah rerender, nilai debounced belum berubah
    expect(result.current).toBe("a");

    await waitFor(
      () => {
        expect(result.current).toBe("ab");
      },
      { timeout: 1000 }
    );
  });

  test("perubahan beruntun hanya menghasilkan 1 update akhir", async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "ab" });
    rerender({ value: "abc" });
    rerender({ value: "abcd" });

    await waitFor(
      () => {
        expect(result.current).toBe("abcd");
      },
      { timeout: 1000 }
    );
  });
});