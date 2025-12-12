  import { loadPetStoryForVariant, loadSeasonEpisodesForVariant, STORY_SEGMENT_COUNT } from "../src/lib/stories";

  jest.mock("../src/lib/firebase", () => ({
    db: {},
  }));

  const mockCollection = jest.fn();
  const mockQuery = jest.fn();
  const mockWhere = jest.fn();
  const mockGetDocs = jest.fn();
  const mockDoc = jest.fn();
  const mockGetDoc = jest.fn();

  jest.mock("firebase/firestore", () => ({
    collection: (...args: any[]) => mockCollection(...args),
    query: (...args: any[]) => mockQuery(...args),
    where: (...args: any[]) => mockWhere(...args),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    doc: (...args: any[]) => mockDoc(...args),
    getDoc: (...args: any[]) => mockGetDoc(...args),
  }));

  describe("stories.ts edge cases", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockGetDocs.mockResolvedValue({ empty: true, forEach: () => {} });
      mockGetDoc.mockResolvedValue({ exists: () => false });
    });

    it("returns null pet story when variant lacks segments and challengeDoc is empty", async () => {
      const story = await loadPetStoryForVariant(
        { variants: { easy: {}, hard: {} } } as any,
        "easy",
        { challengeId: "c1" },
      );
      expect(story).toBeNull();
    });

    it("truncates/pads season episodes and drops invalid segments", async () => {
      const docs = [
        {
          id: "ep1",
          data: () => ({
            segment1: "  https://a.com/1  ",
            segment2: "",
            segment3: "https://a.com/3",
          }),
        },
        {
          id: "ep2",
          data: () => ({
            segmentUrls: ["https://b.com/1", "https://b.com/1", "   "],
          }),
        },
        { id: "epBad", data: () => ({ segmentX: 123 }) },
      ];
      mockGetDocs.mockResolvedValue({
        empty: false,
        forEach: (cb: any) => docs.forEach((d) => cb(d)),
      });

      const episodes = await loadSeasonEpisodesForVariant("easy", { challengeId: "c1" });

      // Only two valid episodes should be returned, with exactly STORY_SEGMENT_COUNT segments each.
      expect(episodes).toHaveLength(2);
      episodes.forEach((ep) => {
        expect(ep.segmentUrls).toBeDefined();
        expect(ep.segmentUrls.length).toBe(STORY_SEGMENT_COUNT);
        ep.segmentUrls.forEach((url) => expect(typeof url).toBe("string"));
      });
    });
  });
