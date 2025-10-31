import React, { createContext, useContext, useEffect, useState } from "react";
import * as Location from "expo-location";

type Loc = { lat: number; lng: number } | null;

type ContextShape = {
  location: Loc;
  ready: boolean;
  refresh: () => Promise<void>;
};

const LocationContext = createContext<ContextShape>({
  location: null,
  ready: false,
  refresh: async () => {},
});

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<Loc>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // fast path: last known position (no prompt, instant when available)
        const last = (Location as any).getLastKnownPositionAsync
          ? await (Location as any).getLastKnownPositionAsync()
          : null;
        if (last && last.coords) {
          if (!mounted) return;
          setLocation({ lat: last.coords.latitude, lng: last.coords.longitude });
        } else {
          // request permission and one quick read (may prompt user)
          const req = (Location as any).requestForegroundPermissionsAsync
            ? await (Location as any).requestForegroundPermissionsAsync()
            : { status: "denied" };
          if (req?.status === "granted") {
            try {
              const pos = (Location as any).getCurrentPositionAsync
                ? await (Location as any).getCurrentPositionAsync({ accuracy: (Location as any).Accuracy?.Low ?? 2 })
                : null;
              if (pos && pos.coords && mounted) {
                setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              }
            } catch (e) {
              // ignore per-platform getCurrentPosition errors
            }
          }
        }
      } catch (e) {
        console.warn("LocationProvider error:", e);
      } finally {
        if (mounted) setReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const refresh = async () => {
    try {
      const req = (Location as any).requestForegroundPermissionsAsync
        ? await (Location as any).requestForegroundPermissionsAsync()
        : { status: "denied" };
      if (req?.status !== "granted") return;
      const pos = (Location as any).getCurrentPositionAsync
        ? await (Location as any).getCurrentPositionAsync({ accuracy: (Location as any).Accuracy?.Low ?? 2 })
        : null;
      if (pos && pos.coords) setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      console.warn("Location refresh failed", e);
    }
  };

  return (
    <LocationContext.Provider value={{ location, ready, refresh }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useAppLocation = () => useContext(LocationContext);
