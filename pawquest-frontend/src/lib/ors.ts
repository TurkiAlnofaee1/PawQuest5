// src/lib/ors.ts
import { Platform } from "react-native";

export type LngLat = { latitude: number; longitude: number };

const ORS_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY;

function ensureKey() {
  if (!ORS_KEY) {
    throw new Error(
      "EXPO_PUBLIC_ORS_API_KEY is missing. Put it in your .env and restart the dev server."
    );
  }
}

function toStr(p: LngLat) {
  // NOTE: ORS expects LON,LAT
  return `${p.longitude},${p.latitude}`;
}

type OrsReturn = {
  feature: any;
  distanceMeters: number | null;
  durationSec: number | null;
};

/**
 * Fetch foot-walking route between two points.
 * 1) Try GET + Accept: application/geo+json
 * 2) If that fails with 406/415/etc, try POST to /geojson with JSON body.
 */
export async function fetchWalkingRoute(start: LngLat, end: LngLat): Promise<OrsReturn> {
  ensureKey();

  const startStr = toStr(start);
  const endStr = toStr(end);

  // --- Attempt 1: GET
  const getUrl =
    `https://api.openrouteservice.org/v2/directions/foot-walking` +
    `?api_key=${encodeURIComponent(ORS_KEY!)}` +
    `&start=${startStr}&end=${endStr}`;

  let res = await fetch(getUrl, {
    method: "GET",
    headers: { Accept: "application/geo+json" },
  });

  // If the server complains about content type / representation, fall back to POST
  if (!res.ok && (res.status === 406 || res.status === 415 || res.status === 400)) {
    // --- Attempt 2: POST with /geojson endpoint
    const postUrl = `https://api.openrouteservice.org/v2/directions/foot-walking/geojson`;
    res = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Authorization": ORS_KEY!,
        "Content-Type": "application/json",
        "Accept": "application/geo+json",
      },
      body: JSON.stringify({
        coordinates: [
          [start.longitude, start.latitude],
          [end.longitude, end.latitude],
        ],
      }),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ORS ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const feature = json?.features?.[0];
  const sum = feature?.properties?.summary;
  return {
    feature,
    distanceMeters: sum?.distance ?? null,
    durationSec: sum?.duration ?? null,
  };
}
