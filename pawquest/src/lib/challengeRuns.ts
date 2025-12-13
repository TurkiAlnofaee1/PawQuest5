export type VariantCompletionFlags = {
  easy: boolean;
  hard: boolean;
};

const hasCompletion = (entry: any): boolean => {
  if (!entry) return false;
  if (entry === true) return true;
  if (typeof entry === "object") {
    if (entry.completed === true) return true;
    if (entry.completedAt) return true;
  }
  return false;
};

export const extractVariantCompletion = (runData: any): VariantCompletionFlags => {
  const variants = runData?.variants ?? {};
  let easy = hasCompletion(variants?.easy);
  let hard = hasCompletion(variants?.hard);

  if (!easy && !hard) {
    const fallback = typeof runData?.variant === "string" ? runData.variant.toLowerCase() : null;
    if (fallback === "easy") easy = true;
    if (fallback === "hard") hard = true;
  }

  return { easy, hard };
};

export const isChallengeFullyLocked = (flags: VariantCompletionFlags): boolean =>
  flags.easy && flags.hard;
