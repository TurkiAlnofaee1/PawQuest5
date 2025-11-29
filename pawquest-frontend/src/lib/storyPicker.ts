import {
  StorySegments,
  loadPetStoryForVariant,
  loadSeasonEpisodesForVariant,
  loadUserStoryProgress,
} from "./stories";
/**
 * A selectable story option in the picker, with a `locked` flag
 * used by the UI to disable episodes that aren't available yet.
 */
export type StoryOption = StorySegments & { locked: boolean };
/**
 * Section of stories grouped by season (for the picker UI).
 */
export type SeasonSection = {
  seasonId: string;
  title: string;
  episodes: StoryOption[];
};
/**
 * Options for loading data for the story picker for a given challenge + variant.
 *
 * - `challengeDoc` / `challengeId`: source challenge, used to pull defaults.
 * - `variantId`: which challenge variant (easy/hard).
 * - `userId`: used to load per-user story progress.
 * - `includePetStory`: whether to include the default pet story.
 * - `includeSeasonSeries`: whether to include the season episodes.
 * - `seasonId`: optionally force a specific season instead of auto-detect.
 */
export type StoryPickerLoadOptions = {
  challengeDoc?: Record<string, unknown> | null;
  challengeId?: string | null;
  variantId: "easy" | "hard";
  userId: string | null;
  includePetStory?: boolean;
  includeSeasonSeries?: boolean;
  seasonId?: string | null;
};
/**
 * Final data shape consumed by the story picker UI.
 *
 * - `stories`: all story segments (pet + season) with enrichment.
 * - `petStoryOptions`: story options for the default pet stories.
 * - `seasonSections`: season stories grouped and ordered by season.
 * - `flatStoryOptions`: flattened list of all options for the picker.
 * - `progressMap`: per-story completion map keyed by `progressKey`.
 */
export type StoryPickerData = {
  stories: StorySegments[];
  petStoryOptions: StoryOption[];
  seasonSections: SeasonSection[];
  flatStoryOptions: StoryOption[];
  progressMap: Record<string, boolean>;
};
/**
 * Sort episodes by episodeNumber (ascending), then by title as a tiebreaker.
 */
const sortEpisodes = (list: StorySegments[]) =>
  [...list].sort((a, b) => {
    const aNum = a.episodeNumber ?? 0;
    const bNum = b.episodeNumber ?? 0;
    if (aNum === bNum) return a.title.localeCompare(b.title);
    return aNum - bNum;
  });
/**
 * Group season-type stories into sections and mark which episodes are locked.
 *
 * Locking rule:
 * - episodes are iterated in sorted order.
 * - once we hit a not-completed episode, `lockFuture` becomes true,
 *   so subsequent episodes are marked `locked: true`.
 * - this allows the UI to show a linear progression through a season.
 */
const buildSeasonSections = (episodes: StorySegments[]): SeasonSection[] => {
  const grouped = new Map<string, StorySegments[]>();
  episodes.forEach((episode) => {
    // Use seasonId when available; fall back to seasonTitle or a generic label.
    const key = episode.seasonId ?? episode.seasonTitle ?? "Story Season";
    const list = grouped.get(key) ?? [];
    list.push(episode);
    grouped.set(key, list);
  });

  return Array.from(grouped.entries()).map(([seasonId, list]) => {
    const sorted = sortEpisodes(list);
    let lockFuture = false;
    const episodeOptions: StoryOption[] = sorted.map((episode) => {
      const locked = lockFuture;
      if (!episode.completed) {
        lockFuture = true;
      } else {
        lockFuture = false;
      }
      return { ...episode, locked };
    });
    return {
      seasonId,
      // Prefer explicit seasonTitle, fallback to group key.
      title: sorted[0]?.seasonTitle ?? seasonId,
      episodes: episodeOptions,
    };
  });
};
/**
 * Load and merge all story data needed for the picker for a given user + challenge variant.
 *
 * Steps:
 *  1. Resolve challengeId and variant metadata (distance/time).
 *  2. In parallel, load:
 *     - pet story for this variant (optional),
 *     - season episodes for this variant (optional),
 *     - the user's completion progress map.
 *  3. Merge + dedupe stories by `progressKey`.
 *  4. Enrich each story with default distance/time from the variant when missing,
 *     and mark `completed` using the progress map.
 *  5. Split into:
 *     - `petStoryOptions` (type === "pet"),
 *     - `seasonSections` (type === "season", grouped + locked),
 *     - `flatStoryOptions` (for simple pickers).
 */
export const loadStoryPickerData = async (
  options: StoryPickerLoadOptions,
): Promise<StoryPickerData> => {
  const { challengeDoc, variantId } = options;
  const challengeId = options.challengeId ?? (challengeDoc as any)?.id ?? null;
  const includePetStory = options.includePetStory ?? true;
  const includeSeasonSeries = options.includeSeasonSeries ?? true;
// Variant metadata (distance/time) used as defaults for stories.
  const variant: Record<string, unknown> | undefined =
    (challengeDoc as any)?.variants?.[variantId];
  const distanceMeters =
    typeof variant?.distanceMeters === "number" ? (variant.distanceMeters as number) : undefined;
  const estimatedTimeMin =
    typeof variant?.estimatedTimeMin === "number"
      ? (variant.estimatedTimeMin as number)
      : undefined;

  // Pick the seasonId from options or from the challenge document.
  const seasonId =
    options.seasonId ??
    (typeof (challengeDoc as any)?.storySeasonId === "string"
      ? ((challengeDoc as any).storySeasonId as string)
      : undefined);
// Load default pet story (if enabled).
  const petStoryPromise = includePetStory
    ? loadPetStoryForVariant(challengeDoc, variantId, {
        challengeId: challengeId ?? undefined,
        distanceMeters,
        estimatedTimeMin,
      })
    : Promise.resolve(null);
  // Load season-based episodes (if enabled).
  const seasonPromise = includeSeasonSeries
    ? loadSeasonEpisodesForVariant(variantId, {
        challengeId: challengeId ?? undefined,
        distanceMeters,
        estimatedTimeMin,
        seasonId: seasonId ?? undefined,
      })
    : Promise.resolve<StorySegments[]>([]);
  // Load per-user completion state keyed by progressKey.
  const progressPromise = loadUserStoryProgress(
    options.userId ?? null,
    variantId,
    challengeId ?? undefined,
  );

  const [petStory, seasonEpisodes, progressMap] = await Promise.all([
    petStoryPromise,
    seasonPromise,
    progressPromise,
  ]);
// Combine pet + season stories before deduping.
  const combined: StorySegments[] = [];
  if (petStory) combined.push(petStory);
  combined.push(...seasonEpisodes);
// Dedupe by progressKey to avoid duplicates across sources.
  const deduped = Array.from(
    combined.reduce((map, story) => {
      map.set(story.progressKey, story);
      return map;
    }, new Map<string, StorySegments>()),
  ).map(([, story]) => story);
// Enrich with default distance/time and completion state.
  const enriched = deduped.map((story) => ({
    ...story,
    distanceMeters: story.distanceMeters ?? distanceMeters,
    durationMinutes: story.durationMinutes ?? estimatedTimeMin,
    estimatedTimeMin: story.estimatedTimeMin ?? estimatedTimeMin,
    completed: story.completed ?? Boolean(progressMap[story.progressKey]),
  }));
// Pet stories: always unlocked.
  const petStoryOptions = enriched
    .filter((story) => story.type === "pet")
    .map((story) => ({ ...story, locked: false }));
// Season stories: grouped + locked by progression.
  const seasonSections = buildSeasonSections(
    enriched.filter((story) => story.type === "season"),
  ).sort((a, b) => a.title.localeCompare(b.title));
// Season stories: grouped + locked by progression.
  const flatStoryOptions = [
    ...petStoryOptions,
    ...seasonSections.flatMap((section) => section.episodes),
  ];

  return {
    stories: enriched,
    petStoryOptions,
    seasonSections,
    flatStoryOptions,
    progressMap,
  };
};