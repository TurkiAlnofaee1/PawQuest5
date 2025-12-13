// src/lib/services/storyGenerator.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// ---- Types ----
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

/**
 * Generate a motivational walking/running story using Gemini based
 * on structured dropdown options.
 *
 * 👉 You can edit the PROMPT_TEMPLATE below to change how stories are written.
 */
export async function generateStoryFromOptions(
  opts: StoryOptions
): Promise<string> {
  if (!API_KEY) {
    throw new Error(
      "Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY in .env"
    );
  }

  const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({
  model: "models/gemini-flash-latest",
});






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

  // 🔧 EDIT THIS PROMPT HOWEVER YOU LIKE
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
${
  storyName
    ? `- Story title: ${storyName}
`
    : ""
}

Guidelines:
- Use second person ("you") most of the time.
- Keep the tone motivational, playful, and encouraging.
- Imagine the user is actually walking while listening.
- Include very short motivational bursts like "Keep going!", "You’ve got this!", etc.
- Occasionally connect the user's steps or breathing to what's happening in the story.
- Target spoken length: about 10–15 minutes of audio.
- Do NOT include any stage directions like "SFX:" or "Narrator:".
- Do NOT mention these bullet points or settings in the output.

Return ONLY the story text (no explanation, no markdown).
`.trim();

  const result = await model.generateContent(PROMPT_TEMPLATE);
  const text = result.response.text().trim();

  if (!text) {
    throw new Error("Gemini returned empty story text.");
  }

  return text;
}
