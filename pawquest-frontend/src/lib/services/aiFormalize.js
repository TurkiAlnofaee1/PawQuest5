// src/lib/services/aiFormalize.ts
import axios from "axios";

export async function formalizeStory(userIdea) {
  console.log("🔹 Sending prompt to Gemini:", userIdea);

  const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!API_KEY) throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY");

  // Use a stable, available model from your ListModels (e.g., gemini-flash-latest)
  const MODEL = "models/gemini-flash-latest";
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${API_KEY}`;

  const prompt = `
You are an energetic AI running companion who creates immersive and motivating storytelling for runners.

Goal:
Turn the user's idea into a structured story with motivation bursts every ~3 minutes. Keep total text < 1MB.

Format:
[STORY]
<story text>
[MOTIVATION]
<motivation text>
(Repeat blocks as needed, end with a strong final motivation.)

User idea: ${userIdea}
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
