// src/lib/services/storyGenerator.ts
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type StoryOptions = {
  storyName?: string;
  role: string;
  theme: string;
  goal: string;
  category: string;
  location: string;
  surprise: string;
  pace: string;
  technology: string;
};

export async function generateStoryFromOptions(
  opts: StoryOptions
): Promise<string> {
  if (!API_KEY) {
    throw new Error(
      "Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY in .env"
    );
  }

  const {
    storyName,
    role,
    theme,
    goal,
    category,
    location,
    surprise,
    pace,
    technology,
  } = opts;

  const PROMPT_TEMPLATE = `
You are an AI storyteller for a mobile fitness game called "PawQuest".
You write short, high-energy audio stories that users listen to while walking or jogging.

Write a single, continuous story (NOT bullet points) with the following settings:

- Player role: ${role}
- Story theme: ${theme}
- Main goal: ${goal}
- Environment category: ${category}
- Specific location: ${location}
- Surprise element: ${surprise}
- Walking pace: ${pace}
- Story technology / world style: ${technology}
${storyName ? `- Story title: ${storyName}\n` : ""}

Guidelines:
- Use second person ("you") most of the time.
- Keep the tone motivational, playful, and encouraging.
- Imagine the user is actually walking while listening.
- Include very short motivational bursts like "Keep going!", "You've got this!", etc.
- Occasionally connect the user's steps or breathing to what's happening in the story.
- Target spoken length: about 10-15 minutes of audio.
- Do NOT include any stage directions like "SFX:" or "Narrator:".
- Do NOT mention these bullet points or settings in the output.

Return ONLY the story text (no explanation, no markdown).
`.trim();

  const response = await fetch(`${GEMINI_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: PROMPT_TEMPLATE }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Gemini request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const parts = data.candidates?.[0]?.content?.parts;
  const text =
    parts && parts.length > 0
      ? parts.map((part) => part.text ?? "").join("\n").trim()
      : "";

  if (!text) {
    throw new Error("Gemini returned empty story text.");
  }

  return text;
}
