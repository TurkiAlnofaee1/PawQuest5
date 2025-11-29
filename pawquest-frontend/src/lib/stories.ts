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

export const STORY_SEGMENT_COUNT = 5;

export type StorySegments = {
  id: string;
  progressKey: string;
  type: StoryType;
  challengeId: string;
  variantId: "easy" | "hard";
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
  seasonId?: string;
};

const STORY_PROGRESS_COLLECTION = "storyProgress";
const DEFAULT_STORY_SEASON = "Story Season 1";
const STORY_SERIES_COLLECTION = "Story Series";
const SEGMENT_KEY_PATTERN = /(part|segment|clip|index|\d)/i;

const sanitizeNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const parseEpisodeNumber = (id: string): number | undefined => {
  const match = id.match(/(\d+)/);
  if (!match) return undefined;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : undefined;
};

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

const extractIndexedSegments = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return uniqueSegments(
      raw.filter((item): item is string => typeof item === "string" && item.length > 0),
    );
  }
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.segmentUrls)) {
      return extractIndexedSegments(record.segmentUrls);
    }
    if (record.index) {
      return extractIndexedSegments(record.index);
    }
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

const collectPetSegments = (variant: Record<string, unknown>, challengeDoc: any): string[] => {
  const sources: unknown[] = [];
  if (variant?.pigeonStory) sources.push((variant as any).pigeonStory);
  if (challengeDoc?.pigeonStory) sources.push(challengeDoc.pigeonStory);
  sources.push(variant);
  const urls: string[] = [];
  sources.forEach((source) => {
    if (urls.length >= STORY_SEGMENT_COUNT) return;
    urls.push(...extractIndexedSegments(source));
  });
  return uniqueSegments(urls);
};

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

  await loadFromCollection(seasonCollectionId);
  if (episodes.length === 0) {
    await loadFromSeriesDoc(seasonCollectionId);
  }
  if (episodes.length === 0 && seasonKey.length === 0) {
    await loadAllSeriesDocs();
  }

  return episodes.sort((a, b) => {
    const aNum = a.episodeNumber ?? 0;
    const bNum = b.episodeNumber ?? 0;
    if (aNum === bNum) return a.title.localeCompare(b.title);
    return aNum - bNum;
  });
};

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
