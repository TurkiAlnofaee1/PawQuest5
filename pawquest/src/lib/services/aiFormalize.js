// src/lib/services/aiFormalize.ts
import axios from "axios";

export async function formalizeStory(userIdea) {
  console.log("🔹 Sending prompt to Gemini:", userIdea);

  const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!API_KEY) throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY");

  // Use a stable, available model from your ListModels (e.g., gemini-flash-latest)
  const MODEL = "models/gemini-flash-latest";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${API_KEY}`;
// summary as a story + max time for the challenge
  const prompt = `
You are writing a motivational running audio story.

User provided text:
User idea: ${userIdea}

Task:
- Summarize / adapt this content into an engaging, energetic story
- Target duration when spoken: about 2 minutes
- Insert short motivational lines throughout with diffrent tones (encouraging, exciting, calming)
- Return only the story text, no explanations.


`.trim();

  try {
    const response = await axios.post(API_URL, {
      contents: [{ parts: [{ text: prompt }] }],
    });

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ AI returned no response.";

    return text;
  } catch (error) {
    console.error("❌ Error from Gemini:", error);
    const msg =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Unknown Gemini error";
    throw new Error(msg);
  }
}
