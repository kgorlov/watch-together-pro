import { useCallback, useEffect, useRef } from "react";

/**
 * Room sync uses a WebSocket server when one is available.
 * BroadcastChannel/localStorage remain as a local fallback for static demos.
 */

export type SyncSource =
  | { type: "none" }
  | { type: "youtube"; videoId: string }
  | { type: "file"; name: string; url: string };

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

export const useRoomSync = (roomCode: string, selfId: string, onEvent: (e: SyncEvent) => void) => {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<SyncEvent[]>([]);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const channelName = `lumen-room-${roomCode}`;
    let bc: BroadcastChannel | null = null;
    let ws: WebSocket | null = null;
    let storageHandler: ((e: StorageEvent) => void) | null = null;
    let reconnectTimer: number | undefined;
    let closedByHook = false;

    const dispatch = (raw: unknown) => {
      const event = raw as SyncEvent;
      if (!event || typeof event !== "object" || !("kind" in event)) return;
      if ("from" in event && event.from === selfId) return;
      handlerRef.current(event);
    };

    const syncServerUrl = getSyncServerUrl(roomCode, selfId);
    const connectWs = () => {
      if (!syncServerUrl) return;

      ws = new WebSocket(syncServerUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const queued = pendingRef.current.splice(0);
        for (const event of queued) {
          ws?.send(JSON.stringify(event));
        }
      };

      ws.onmessage = (ev) => {
        try {
          dispatch(JSON.parse(ev.data));
        } catch {
          // Ignore malformed messages from the wire.
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        if (!closedByHook) {
          reconnectTimer = window.setTimeout(connectWs, 1500);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connectWs();

    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(channelName);
      bc.onmessage = (ev) => dispatch(ev.data);
      channelRef.current = bc;
    } else {
      storageHandler = (ev: StorageEvent) => {
        if (ev.key !== channelName || !ev.newValue) return;
        try {
          dispatch(JSON.parse(ev.newValue));
        } catch {
          // Ignore malformed localStorage messages.
        }
      };
      window.addEventListener("storage", storageHandler);
    }

    return () => {
      closedByHook = true;
      window.clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      bc?.close();
      channelRef.current = null;
      if (storageHandler) window.removeEventListener("storage", storageHandler);
    };
  }, [roomCode, selfId]);

  const send = useCallback(
    (event: Omit<SyncEvent, "from" | "at"> & { from?: string; at?: number }) => {
      const payload = { ...event, from: selfId, at: Date.now() } as SyncEvent;
      const ws = wsRef.current;

      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        return;
      }

      if (ws?.readyState === WebSocket.CONNECTING) {
        pendingRef.current.push(payload);
        return;
      }

      const bc = channelRef.current;
      if (bc) {
        bc.postMessage(payload);
      } else {
        const key = `lumen-room-${roomCode}`;
        try {
          localStorage.setItem(key, JSON.stringify(payload));
        } catch {
          // Ignore storage failures in private/incognito modes.
        }
      }
    },
    [roomCode, selfId],
  );

  return { send };
};

function getSyncServerUrl(roomCode: string, selfId: string) {
  const explicitUrl = import.meta.env.VITE_SYNC_SERVER_URL as string | undefined;
  const baseUrl = explicitUrl?.trim() || getSameOriginSyncBaseUrl();
  if (!baseUrl) {
    return "";
  }

  const wsUrl = new URL("/ws", baseUrl);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.searchParams.set("room", roomCode);
  wsUrl.searchParams.set("user", selfId);
  return wsUrl.toString();
}

function getSameOriginSyncBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, origin, protocol } = window.location;
  const isLocalVite = hostname === "localhost" || hostname === "127.0.0.1";
  const isGitHubPages = hostname.endsWith("github.io");

  if (!origin || isLocalVite || isGitHubPages || protocol === "file:") {
    return "";
  }

  return origin;
}
