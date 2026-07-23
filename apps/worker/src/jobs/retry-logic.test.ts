import { describe, expect, test } from "bun:test";

/**
 * Test logic murni penentuan "apakah ini percobaan terakhir",
 * diekstrak supaya bisa ditest tanpa perlu job BullMQ sungguhan.
 */
function isFinalAttempt(attemptsMade: number, maxAttempts: number): boolean {
  const currentAttempt = attemptsMade + 1;
  return currentAttempt >= maxAttempts;
}

describe("Retry logic - isFinalAttempt", () => {
  test("percobaan pertama dari 3 total BUKAN final attempt", () => {
    expect(isFinalAttempt(0, 3)).toBe(false); // attemptsMade=0 -> currentAttempt=1
  });

  test("percobaan kedua dari 3 total BUKAN final attempt", () => {
    expect(isFinalAttempt(1, 3)).toBe(false); // attemptsMade=1 -> currentAttempt=2
  });

  test("percobaan ketiga dari 3 total ADALAH final attempt", () => {
    expect(isFinalAttempt(2, 3)).toBe(true); // attemptsMade=2 -> currentAttempt=3
  });

  test("dengan maxAttempts=1 (tanpa retry sama sekali), percobaan pertama langsung final", () => {
    expect(isFinalAttempt(0, 1)).toBe(true);
  });
});