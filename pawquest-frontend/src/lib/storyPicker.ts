import {
  StorySegments,
  loadPetStoryForVariant,
  loadSeasonEpisodesForVariant,
  loadUserStoryProgress,
} from "./stories";

export type StoryOption = StorySegments & { locked: boolean };

export type SeasonSection = {
  seasonId: string;
  title: string;
  episodes: StoryOption[];
};

export type StoryPickerLoadOptions = {
  challengeDoc?: Record<string, unknown> | null;
  challengeId?: string | null;
  variantId: "easy" | "hard";
  userId: string | null;
  includePetStory?: boolean;
  includeSeasonSeries?: boolean;
  seasonId?: string | null;
};

export type StoryPickerData = {
  stories: StorySegments[];
  petStoryOptions: StoryOption[];
  seasonSections: SeasonSection[];
  flatStoryOptions: StoryOption[];
  progressMap: Record<string, boolean>;
};

const sortEpisodes = (list: StorySegments[]) =>
  [...list].sort((a, b) => {
    const aNum = a.episodeNumber ?? 0;
    const bNum = b.episodeNumber ?? 0;
    if (aNum === bNum) return a.title.localeCompare(b.title);
    return aNum - bNum;
  });

const buildSeasonSections = (episodes: StorySegments[]): SeasonSection[] => {
  const grouped = new Map<string, StorySegments[]>();
  episodes.forEach((episode) => {
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
      title: sorted[0]?.seasonTitle ?? seasonId,
      episodes: episodeOptions,
    };
  });
};

export const loadStoryPickerData = async (
  options: StoryPickerLoadOptions,
): Promise<StoryPickerData> => {
  const { challengeDoc, variantId } = options;
  const challengeId = options.challengeId ?? (challengeDoc as any)?.id ?? null;
  const includePetStory = options.includePetStory ?? true;
  const includeSeasonSeries = options.includeSeasonSeries ?? true;

  const variant: Record<string, unknown> | undefined =
    (challengeDoc as any)?.variants?.[variantId];
  const distanceMeters =
    typeof variant?.distanceMeters === "number" ? (variant.distanceMeters as number) : undefined;
  const estimatedTimeMin =
    typeof variant?.estimatedTimeMin === "number"
      ? (variant.estimatedTimeMin as number)
      : undefined;

  const seasonId =
    options.seasonId ??
    (typeof (challengeDoc as any)?.storySeasonId === "string"
      ? ((challengeDoc as any).storySeasonId as string)
      : undefined);

  const petStoryPromise = includePetStory
    ? loadPetStoryForVariant(challengeDoc, variantId, {
        challengeId: challengeId ?? undefined,
        distanceMeters,
        estimatedTimeMin,
      })
    : Promise.resolve(null);

  const seasonPromise = includeSeasonSeries
    ? loadSeasonEpisodesForVariant(variantId, {
        challengeId: challengeId ?? undefined,
        distanceMeters,
        estimatedTimeMin,
        seasonId: seasonId ?? undefined,
      })
    : Promise.resolve<StorySegments[]>([]);

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

  const combined: StorySegments[] = [];
  if (petStory) combined.push(petStory);
  combined.push(...seasonEpisodes);

  const deduped = Array.from(
    combined.reduce((map, story) => {
      map.set(story.progressKey, story);
      return map;
    }, new Map<string, StorySegments>()),
  ).map(([, story]) => story);

  const enriched = deduped.map((story) => ({
    ...story,
    distanceMeters: story.distanceMeters ?? distanceMeters,
    durationMinutes: story.durationMinutes ?? estimatedTimeMin,
    estimatedTimeMin: story.estimatedTimeMin ?? estimatedTimeMin,
    completed: story.completed ?? Boolean(progressMap[story.progressKey]),
  }));

  const petStoryOptions = enriched
    .filter((story) => story.type === "pet")
    .map((story) => ({ ...story, locked: false }));

  const seasonSections = buildSeasonSections(
    enriched.filter((story) => story.type === "season"),
  ).sort((a, b) => a.title.localeCompare(b.title));

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
