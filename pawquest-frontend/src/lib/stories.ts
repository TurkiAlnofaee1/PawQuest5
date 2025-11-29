import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export type StoryType = "pet" | "season";
/**
 * Number of audio segments each story should have.
 * If fewer are provided, we pad using the last one.
 */
export const STORY_SEGMENT_COUNT = 5;

/**
 * Canonical shape for a playable story (pet or season).
 * `segmentUrls` is the ordered list of audio clips.
 */
export type StorySegments = {
  id: string;
  /** Used to identify progress rows per story (pet or season episode). */
  progressKey: string;
  type: StoryType;
  challengeId: string;
  variantId: "easy" | "hard";
  /** Currently only "pigeon", but kept generic for future pets. */
  petKey?: "pigeon";
  seasonId?: string;
  episodeId?: string;
  episodeNumber?: number;
  title: string;
  subtitle?: string;
  durationMinutes?: number;
  distanceMeters?: number;
  segmentUrls: string[];
  estimatedTimeMin?: number;
  calories?: number;
  hiitType?: string;
  /** Set from DB to indicate if the user finished this story. */
  completed?: boolean;
  seasonTitle?: string;
};

type LoadPetOpts = {
  challengeId?: string;
  distanceMeters?: number;
  estimatedTimeMin?: number;
};

type LoadSeasonOpts = {
  challengeId?: string;
  distanceMeters?: number;
  estimatedTimeMin?: number;
  /** Optional override; if omitted, we fall back to DEFAULT_STORY_SEASON. */
  seasonId?: string;
};

const STORY_PROGRESS_COLLECTION = "storyProgress";
const DEFAULT_STORY_SEASON = "Story Season 1";
const STORY_SERIES_COLLECTION = "Story Series";
/**
 * Keys we treat as potential "segment index" fields (segment1, clip_2, etc.).
 */
const SEGMENT_KEY_PATTERN = /(part|segment|clip|index|\d)/i;
/**
 * Ensure we only accept finite numbers; otherwise return undefined.
 */
const sanitizeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
/**
 * Try to infer an episode number from a string id (e.g., "ep3" => 3).
 */
const parseEpisodeNumber = (id: string): number | undefined => {
  const match = id.match(/(\d+)/);
  if (!match) return undefined;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : undefined;
};
/**
 * Deduplicate/clean a list of segment URLs, then:
 *  - truncate to STORY_SEGMENT_COUNT
 *  - pad by repeating the last segment until we reach STORY_SEGMENT_COUNT
 */
const uniqueSegments = (list: string[]): string[] => {
  const seen = new Set<string>();
  const clean: string[] = [];
  list.forEach((url) => {
    if (typeof url !== "string" || url.trim().length === 0) return;
    const trimmed = url.trim();
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    clean.push(trimmed);
  });
  const trimmed = clean.slice(0, STORY_SEGMENT_COUNT);
  if (trimmed.length === 0) return trimmed;
  while (trimmed.length < STORY_SEGMENT_COUNT) {
    trimmed.push(trimmed[trimmed.length - 1]);
  }
  return trimmed;
};
/**
 * Extract segment URLs from a flexible structure:
 * - array of URLs
 * - object with segmentUrls/index/segments/... fields
 * - object with keys like segment1, clip2, part3...
 * - plain string
 *
 * Always returns a cleaned, deduplicated list.
 */
const extractIndexedSegments = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return uniqueSegments(
      raw.filter((item): item is string => typeof item === "string" && item.length > 0),
    );
  }
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    // Common nested shapes: { segmentUrls: [...] } or { index: [...] }
    if (Array.isArray(record.segmentUrls)) {
      return extractIndexedSegments(record.segmentUrls);
    }
    if (record.index) {
      return extractIndexedSegments(record.index);
    }
    // Generic object: pick keys that look like segments (segment1, clip_2, etc.)
    const entries: { idx: number; value: string }[] = [];
    Object.entries(record).forEach(([key, value]) => {
      if (typeof value !== "string" || value.trim().length === 0) return;
      if (!SEGMENT_KEY_PATTERN.test(key)) return;
      const idxMatch = key.match(/(\d+)/);
      const idx = idxMatch ? Number(idxMatch[1]) : entries.length;
      entries.push({ idx, value: value.trim() });
    });
    return uniqueSegments(entries.sort((a, b) => a.idx - b.idx).map((entry) => entry.value));
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    return [raw.trim()];
  }
  return [];
};
/**
 * Build a stable progress key that we use to store completion in Firestore.
 * - Pet stories:  "pet:<petKey>"
 * - Season story: "season:<seasonId>:<episodeId>"
 */
const getStoryProgressKey = (story: {
  type: StoryType;
  petKey?: string;
  seasonId?: string;
  episodeId?: string;
}): string => {
  if (story.type === "pet") {
    return `pet:${story.petKey ?? "pet"}`;
  }
  return `season:${story.seasonId ?? "season"}:${story.episodeId ?? "episode"}`;
};
/**
 * Attach id + progressKey to a story. If id is missing, we reuse progressKey.
 */
const withStoryMetadata = (
  story: Omit<StorySegments, "progressKey" | "id"> & Partial<Pick<StorySegments, "id">>,
): StorySegments => {
  const progressKey = getStoryProgressKey(story);
  return {
    ...story,
    id: story.id ?? progressKey,
    progressKey,
  };
};
/**
 * Collect the pet story segments for a challenge variant.
 * Priority:
 *  1. variant.pigeonStory
 *  2. challengeDoc.pigeonStory
 *  3. variant itself as a generic container
 */
const collectPetSegments = (variant: Record<string, unknown>, challengeDoc: any): string[] => {
  const sources: unknown[] = [];
  if (variant?.pigeonStory) sources.push((variant as any).pigeonStory);
  if (challengeDoc?.pigeonStory) sources.push(challengeDoc.pigeonStory);
  // fallback: try to parse segments from the whole variant object
  sources.push(variant);
  const urls: string[] = [];
  sources.forEach((source) => {
    if (urls.length >= STORY_SEGMENT_COUNT) return;
    urls.push(...extractIndexedSegments(source));
  });
  return uniqueSegments(urls);
};
/**
 * Load the default pet story (e.g., pigeon) for a given challenge + variant.
 *
 * It:
 *  - pulls segments from challenge/variant fields (pigeonStory, etc.)
 *  - builds a nice title based on rewardPet or pigeonStory.title
 *  - wires up distance/time and optional HIIT metadata
 */
export const loadPetStoryForVariant = async (
  challengeDoc: any,
  variantId: "easy" | "hard",
  options: LoadPetOpts = {},
): Promise<StorySegments | null> => {
  if (!challengeDoc || !challengeDoc.variants) return null;
  const variant: any = challengeDoc.variants?.[variantId];
  if (!variant) return null;
  const segmentUrls = collectPetSegments(variant, challengeDoc);
  if (segmentUrls.length === 0) return null;

  const titleSource = challengeDoc?.pigeonStory?.title ?? challengeDoc?.rewardPet ?? "Pet Story";
  const builtTitle =
    typeof titleSource === "string" && titleSource.length > 0
      ? titleSource.includes("Story")
        ? titleSource
        : `${titleSource} Story`
      : "Pet Story";

  return withStoryMetadata({
    type: "pet",
    challengeId: options.challengeId ?? challengeDoc?.id ?? "",
    variantId,
    petKey: "pigeon",
    title: builtTitle,
    subtitle:
      typeof challengeDoc?.pigeonStory?.subtitle === "string"
        ? challengeDoc.pigeonStory.subtitle
        : undefined,
    distanceMeters: options.distanceMeters ?? sanitizeNumber(variant.distanceMeters),
    durationMinutes: options.estimatedTimeMin ?? sanitizeNumber(variant.estimatedTimeMin),
    estimatedTimeMin: options.estimatedTimeMin ?? sanitizeNumber(variant.estimatedTimeMin),
    calories: sanitizeNumber(variant.calories),
    hiitType: typeof variant?.hiitType === "string" ? variant.hiitType : undefined,
    segmentUrls,
    episodeNumber: 0,
    seasonId: "pet",
    episodeId: "pigeon",
  });
};
/**
 * Load season-style story episodes for a variant, with a flexible data model:
 *
 * 1. Try a Firestore collection with id = seasonId (or DEFAULT_STORY_SEASON).
 * 2. If empty, try a single "Story Series" doc with that id.
 * 3. If still empty and no seasonId was provided, load ALL Story Series docs.
 *
 * Returns a unified, deduped list of StorySegments sorted by episodeNumber/title.
 */
export const loadSeasonEpisodesForVariant = async (
  variantId: "easy" | "hard",
  options: LoadSeasonOpts = {},
): Promise<StorySegments[]> => {
  const seasonKey = options.seasonId?.trim() ?? "";
  const seasonCollectionId = seasonKey.length > 0 ? seasonKey : DEFAULT_STORY_SEASON;
  const episodes: StorySegments[] = [];

  const appendEpisodes = (list: StorySegments[]) => {
    list.forEach((entry) => {
      const exists = episodes.some(
        (existing) =>
          existing.seasonId === entry.seasonId &&
          existing.episodeId === entry.episodeId &&
          existing.episodeNumber === entry.episodeNumber,
      );
      if (!exists) episodes.push(entry);
    });
  };

  /**
   * Load episodes from a Firestore collection where each document is an episode.
   */
  const loadFromCollection = async (collectionId: string) => {
    try {
      const ref = collection(db, collectionId);
      const snap = await getDocs(ref);
      if (snap.empty) return;
      const list: StorySegments[] = [];
      snap.forEach((document) => {
        const data = document.data() as Record<string, unknown>;
        const segmentUrls = extractIndexedSegments(
          data.index ?? data.segmentUrls ?? data.segments ?? data,
        );
        if (segmentUrls.length === 0) return;
        const episodeNumber =
          sanitizeNumber(data.episodeNumber) ?? parseEpisodeNumber(document.id) ?? list.length + 1;
        list.push(
          withStoryMetadata({
            type: "season",
            challengeId: options.challengeId ?? "",
            variantId,
            seasonId: collectionId,
            seasonTitle:
              typeof data.seasonTitle === "string" && data.seasonTitle.length > 0
                ? data.seasonTitle
                : collectionId,
            episodeId: document.id,
            episodeNumber,
            title:
              typeof data.title === "string" && data.title.length > 0
                ? data.title
                : `Episode ${episodeNumber}`,
            subtitle: typeof data.subtitle === "string" ? data.subtitle : collectionId,
            distanceMeters: options.distanceMeters,
            durationMinutes: options.estimatedTimeMin,
            estimatedTimeMin: options.estimatedTimeMin,
            hiitType: typeof data.hiitType === "string" ? data.hiitType : undefined,
            segmentUrls,
          }),
        );
      });
      appendEpisodes(list);
    } catch {
      // ignore invalid collection path
    }
  };

    /**
   * Build episodes from a "Story Series" doc where each field is an episode.
   */
  const buildEpisodesFromSeriesDoc = (
    seriesId: string,
    raw: Record<string, unknown>,
  ): StorySegments[] => {
    const docTitle =
      typeof raw.title === "string" && raw.title.trim().length > 0 ? raw.title.trim() : seriesId;
    const out: StorySegments[] = [];
    Object.entries(raw).forEach(([key, value]) => {
      if (["title", "seasonTitle", "seasonName", "description", "coverImage"].includes(key)) return;
      const meta =
        value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
      const segmentSource =
        meta?.segments ?? meta?.segmentUrls ?? meta?.clips ?? meta?.index ?? value;
      const segmentUrls = extractIndexedSegments(segmentSource);
      if (segmentUrls.length === 0) return;
      const episodeNumber =
        sanitizeNumber(meta?.episodeNumber) ?? parseEpisodeNumber(key) ?? out.length + 1;
      out.push(
        withStoryMetadata({
          type: "season",
          challengeId: options.challengeId ?? "",
          variantId,
          seasonId: seriesId,
          seasonTitle: docTitle,
          episodeId: key,
          episodeNumber,
          title:
            typeof meta?.title === "string" && meta.title.trim().length > 0
              ? meta.title.trim()
              : `Episode ${episodeNumber}`,
          subtitle:
            typeof meta?.subtitle === "string" && meta.subtitle.trim().length > 0
              ? meta.subtitle.trim()
              : docTitle,
          distanceMeters: options.distanceMeters,
          durationMinutes: options.estimatedTimeMin,
          estimatedTimeMin: options.estimatedTimeMin,
          hiitType: typeof meta?.hiitType === "string" ? meta.hiitType : undefined,
          segmentUrls,
        }),
      );
    });
    return out;
  };
  /**
   * Try loading a specific "Story Series" doc by id.
   */
  const loadFromSeriesDoc = async (seriesId: string | null) => {
    if (!seriesId) return;
    try {
      const ref = doc(db, STORY_SERIES_COLLECTION, seriesId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      appendEpisodes(buildEpisodesFromSeriesDoc(snap.id, snap.data() as Record<string, unknown>));
    } catch {
      // ignore
    }
  };

    /**
   * Fallback: load episodes from all "Story Series" docs
   * (used only when no specific seasonKey is provided and nothing else was found).
   */
  const loadAllSeriesDocs = async () => {
    try {
      const ref = collection(db, STORY_SERIES_COLLECTION);
      const snap = await getDocs(ref);
      snap.forEach((docSnap) => {
        appendEpisodes(buildEpisodesFromSeriesDoc(docSnap.id, docSnap.data() as Record<string, unknown>));
      });
    } catch {
      // ignore
    }
  };
  // 1) Try collection-based episodes.
  await loadFromCollection(seasonCollectionId);
  
  // 2) If none, try the corresponding Story Series doc.
  if (episodes.length === 0) {
    await loadFromSeriesDoc(seasonCollectionId);
  }
  // 3) If still none and no explicit season was requested, load all series docs.
  if (episodes.length === 0 && seasonKey.length === 0) {
    await loadAllSeriesDocs();
  }
  // Final ordering for UI.
  return episodes.sort((a, b) => {
    const aNum = a.episodeNumber ?? 0;
    const bNum = b.episodeNumber ?? 0;
    if (aNum === bNum) return a.title.localeCompare(b.title);
    return aNum - bNum;
  });
};
/**
 * Load all story completion entries for a user.
 * For pet stories, we optionally filter by challengeId so that completion
 * can be per-challenge if needed.
 *
 * Returns: { [progressKey]: true } for completed stories.
 */
export const loadUserStoryProgress = async (
  userId: string | null,
  variantId: string,
  challengeId?: string | null,
): Promise<Record<string, boolean>> => {
  if (!userId) return {};
  const progress: Record<string, boolean> = {};
  const q = query(collection(db, STORY_PROGRESS_COLLECTION), where("userId", "==", userId));
  const snap = await getDocs(q);

  snap.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const type: StoryType = data.type === "season" ? "season" : "pet";

    // Pet stories can be tied to a specific challenge.
    if (type === "pet" && challengeId && typeof data.challengeId === "string") {
      if (data.challengeId !== challengeId) return;
    }
    const key =
      typeof data.progressKey === "string"
        ? data.progressKey
        : getStoryProgressKey({
            type,
            petKey: typeof data.petKey === "string" ? data.petKey : undefined,
            seasonId: typeof data.seasonId === "string" ? data.seasonId : undefined,
            episodeId: typeof data.episodeId === "string" ? data.episodeId : undefined,
          });
    if (key) {
      progress[key] = Boolean(data.completed);
    }
  });

  return progress;
};

/**
 * Save that a user has completed a given story (pet or season episode).
 * We include variantId in the docId so completion can be per-variant.
 */
export const saveStoryCompletion = async (userId: string | null, story: StorySegments) => {
  if (!userId) return;
  const docId = `${userId}_${story.progressKey}_${story.variantId}`;
  const ref = doc(collection(db, STORY_PROGRESS_COLLECTION), docId);
  await setDoc(
    ref,
    {
      userId,
      variantId: story.variantId,
      challengeId: story.challengeId,
      type: story.type,
      seasonId: story.seasonId ?? null,
      episodeId: story.episodeId ?? null,
      petKey: story.petKey ?? null,
      progressKey: story.progressKey,
      completed: true,
      completedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

/**
 * Build a short human-readable summary for UI (e.g., in the picker card).
 */
export const describeSegmentsMeta = (story?: StorySegments | null) => {
  if (!story) return "5 Story Segments • Triggered every 20%";
  const tokens: string[] = [`${story.segmentUrls.length} Story Segments`];
  if (typeof story.distanceMeters === "number" && story.distanceMeters > 0) {
    tokens.push("Triggered every 20% of distance");
  } else {
    tokens.push("Triggered every checkpoint");
  }
  return tokens.join(" • ");
};
