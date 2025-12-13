import { extractVariantCompletion, isChallengeFullyLocked } from "../src/lib/challengeRuns";

describe("challengeRuns edge cases", () => {
  it("handles partial/malformed variant flags", () => {
    const flags = extractVariantCompletion({
      variants: { easy: { completedAt: "yesterday" }, hard: { completed: "yes" } },
    });
    expect(flags).toEqual({ easy: true, hard: false });
    expect(isChallengeFullyLocked(flags)).toBe(false);
  });

  it("falls back to legacy variant field when variants map is missing", () => {
    const flags = extractVariantCompletion({ variant: "HARD" });
    expect(flags).toEqual({ easy: false, hard: true });
    expect(isChallengeFullyLocked(flags)).toBe(false);
  });
});
