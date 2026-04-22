import { useEffect, useRef, useCallback } from "react";

/**
 * Cross-tab room sync via BroadcastChannel (with localStorage fallback).
 * No backend — works between tabs of the same browser sharing the same origin.
 */

export type SyncSource =
  | { type: "none" }
  | { type: "youtube"; videoId: string }
  | { type: "file"; name: string }; // file URLs are blob:, can't be shared cross-tab — name only

export type SyncEvent =
  | { kind: "play"; t: number; at: number; from: string }
  | { kind: "pause"; t: number; at: number; from: string }
  | { kind: "seek"; t: number; at: number; from: string }
  | { kind: "tick"; t: number; playing: boolean; at: number; from: string }
  | { kind: "source"; source: SyncSource; at: number; from: string }
  | { kind: "chat"; id: string; user: string; avatar: string; text: string; at: number; from: string }
  | { kind: "presence"; user: string; avatar: string; at: number; from: string }
  | { kind: "leave"; from: string; at: number }
  | { kind: "hello"; from: string; user: string; avatar: string; at: number }
  | { kind: "state-request"; from: string; at: number }
  | { kind: "state-snapshot"; source: SyncSource; t: number; playing: boolean; at: number; from: string };

export const useRoomSync = (
  roomCode: string,
  selfId: string,
  onEvent: (e: SyncEvent) => void
) => {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const channelName = `lumen-room-${roomCode}`;
    let bc: BroadcastChannel | null = null;
    let storageHandler: ((e: StorageEvent) => void) | null = null;

    const dispatch = (raw: unknown) => {
      const e = raw as SyncEvent;
      if (!e || typeof e !== "object" || !("kind" in e)) return;
      if ("from" in e && e.from === selfId) return; // ignore self-echo
      handlerRef.current(e);
    };

    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(channelName);
      bc.onmessage = (ev) => dispatch(ev.data);
      channelRef.current = bc;
    } else {
      // Fallback: localStorage events
      storageHandler = (ev: StorageEvent) => {
        if (ev.key !== channelName || !ev.newValue) return;
        try { dispatch(JSON.parse(ev.newValue)); } catch { /* noop */ }
      };
      window.addEventListener("storage", storageHandler);
    }

    return () => {
      bc?.close();
      channelRef.current = null;
      if (storageHandler) window.removeEventListener("storage", storageHandler);
    };
  }, [roomCode, selfId]);

  const send = useCallback((event: Omit<SyncEvent, "from" | "at"> & { from?: string; at?: number }) => {
    const payload = { ...event, from: selfId, at: Date.now() } as SyncEvent;
    const bc = channelRef.current;
    if (bc) {
      bc.postMessage(payload);
    } else {
      const key = `lumen-room-${roomCode}`;
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch { /* noop */ }
    }
  }, [roomCode, selfId]);

  return { send };
};
