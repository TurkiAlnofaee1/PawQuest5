import axios from "axios";
// Use legacy FileSystem API to avoid deprecation warnings in Expo SDK 54+
import * as FileSystem from "expo-file-system/legacy";
import { Buffer } from "buffer";

const API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
const VOICE_ID = process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel

const BASE_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
const TTS_CACHE_DIR = `${FileSystem.cacheDirectory}tts/`;

async function ensureDir(path: string) {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    }
  } catch {
    // ignore
  }
}

export async function generateVoiceFromElevenLabs(text: string): Promise<string | null> {
  if (!API_KEY) {
    console.warn("Missing ELEVENLABS API key. Add EXPO_PUBLIC_ELEVENLABS_API_KEY to .env");
    return null;
  }

  console.log("🎧 Sending text to ElevenLabs...", {
    length: text?.length ?? 0,
    voiceId: VOICE_ID,
  });

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

    // Save to temp file to avoid large data: URIs and reduce JS overhead
    const base64 = Buffer.from(response.data).toString("base64");
    await ensureDir(TTS_CACHE_DIR);
    const fileUri = `${TTS_CACHE_DIR}tts-${Date.now().toString(36)}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  } catch (err: any) {
    const status = err.response?.status;
    const detail =
      typeof err.response?.data === "string" ? err.response.data : JSON.stringify(err.response?.data ?? {});
    console.warn("🚫 ElevenLabs TTS Error:", status, detail || err?.message || err);

    // Return null to avoid unhandled errors in the UI; caller will show a friendly message.
    return null;
  }
}
