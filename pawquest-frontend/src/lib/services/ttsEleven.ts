import axios from "axios";
import { Buffer } from "buffer";

const API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
const VOICE_ID =
  process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel

const BASE_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

export async function generateVoiceFromElevenLabs(text: string): Promise<string> {
  if (!API_KEY) {
    throw new Error("Missing ELEVENLABS API key. Add EXPO_PUBLIC_ELEVENLABS_API_KEY to .env");
  }

  console.log("🎧 Sending text to ElevenLabs...");

  try {
    const response = await axios.post(
      BASE_URL,
      {
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": API_KEY,
          Accept: "audio/mpeg",
        },
        responseType: "arraybuffer",
      }
    );

    console.log("🎧 ElevenLabs audio received.");

    const base64 = Buffer.from(response.data, "binary").toString("base64");
    const uri = `data:audio/mpeg;base64,${base64}`;
    return uri;
  } catch (err: any) {
    console.log("❌ ElevenLabs TTS Error:", err.response?.status, err.response?.data);

    if (err.response?.status === 401) {
      throw new Error("401 Unauthorized — Your API key is INVALID or missing permissions.");
    }

    throw new Error("Failed to generate ElevenLabs audio.");
  }
}
