import { describe, expect, it } from "vitest";
import { nextMagazineBoundary } from "./next-magazine-boundary";

describe("nextMagazineBoundary", () => {
  it("uses the next Monday at 00:00 KST during an ordinary week", () => {
    expect(nextMagazineBoundary(new Date("2026-07-14T03:00:00.000Z")).toISOString()).toBe(
      "2026-07-19T15:00:00.000Z"
    );
  });

  it("moves to the following Monday when invoked exactly on a Monday boundary", () => {
    expect(nextMagazineBoundary(new Date("2026-07-19T15:00:00.000Z")).toISOString()).toBe(
      "2026-07-26T15:00:00.000Z"
    );
  });

  it("selects the first day of the next month when it arrives before Monday", () => {
    expect(nextMagazineBoundary(new Date("2026-07-30T15:00:00.000Z")).toISOString()).toBe(
      "2026-07-31T15:00:00.000Z"
    );
  });
});
