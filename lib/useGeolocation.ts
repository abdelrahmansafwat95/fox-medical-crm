"use client";

import { useState, useEffect, useCallback } from "react";

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
}

export interface GeoState {
  position: GeoPosition | null;
  error: string | null;
  loading: boolean;
  permission: PermissionState | "unknown";
}

/**
 * One-shot location getter — used at check-in time.
 * Forces high accuracy and a 10s timeout.
 */
export function useGeolocation(): GeoState & {
  refresh: () => void;
} {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
    loading: false,
    permission: "unknown"
  });

  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocation not supported on this device." }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          position: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp
          },
          error: null,
          loading: false,
          permission: "granted"
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enable it in your browser settings."
            : err.code === err.POSITION_UNAVAILABLE
            ? "Location signal unavailable. Try moving outdoors."
            : err.code === err.TIMEOUT
            ? "Location request timed out."
            : err.message;
        setState((s) => ({
          ...s,
          loading: false,
          error: msg,
          permission: err.code === err.PERMISSION_DENIED ? "denied" : s.permission
        }));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, []);

  // Check permission status on mount (browsers that support it)
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((res) => setState((s) => ({ ...s, permission: res.state })))
        .catch(() => {});
    }
  }, []);

  return { ...state, refresh };
}

/**
 * Continuous tracking — used during a working day.
 * Posts to /api/tracking/ping on each significant move.
 * Returns control handles so the UI can show status.
 */
export function useLocationTracking(opts?: {
  intervalMs?: number;
  onPing?: (pos: GeoPosition) => void;
}) {
  const intervalMs = opts?.intervalMs ?? 60_000; // default 60s
  const [active, setActive] = useState(false);
  const [lastPing, setLastPing] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;

    const sendPing = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const p: GeoPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp
          };
          setLastPing(p);
          opts?.onPing?.(p);

          // POST to /api/tracking/ping (fire and forget)
          fetch("/api/tracking/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: p.latitude,
              longitude: p.longitude,
              accuracy_m: p.accuracy,
              speed_kmh: p.speed != null ? p.speed * 3.6 : null,
              heading: p.heading
            })
          }).catch(() => {});
        },
        (err) => {
          if (cancelled) return;
          setError(err.message);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
      );
    };

    sendPing();
    const id = setInterval(sendPing, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs]);

  return {
    active,
    lastPing,
    error,
    start: () => setActive(true),
    stop: () => setActive(false)
  };
}
