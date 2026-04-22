import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube, { YouTubePlayer } from "react-youtube";
import {
  Film, Users, Copy, Check, Send, Youtube as YoutubeIcon, Upload, Link as LinkIcon,
  Play, Pause, RotateCcw, Volume2, VolumeX, ArrowLeft, Smile, Maximize2, Sparkles, Radio
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRoomSync, type SyncEvent, type SyncSource } from "@/hooks/useRoomSync";
import { SyncTimeline } from "@/components/SyncTimeline";

type Source =
  | { type: "none" }
  | { type: "youtube"; videoId: string; title?: string }
  | { type: "file"; url: string; name: string };

type Message = {
  id: string;
  user: string;
  avatar: string;
  text: string;
  ts: number;
  system?: boolean;
};

const palette = ["#6366f1", "#a78bfa", "#22d3ee", "#f472b6", "#34d399", "#fbbf24"];
const MAX_VIDEO_UPLOAD_SIZE = 512 * 1024 * 1024;

const extractYoutubeId = (input: string): string | null => {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
};

const getBackendBaseUrl = () => {
  const explicitUrl = import.meta.env.VITE_SYNC_SERVER_URL as string | undefined;
  if (explicitUrl?.trim()) {
    return explicitUrl.trim();
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, origin, protocol } = window.location;
  const isGitHubPages = hostname.endsWith("github.io");
  if (!origin || isGitHubPages || protocol === "file:") {
    return "";
  }

  return origin;
};

const getUploadUrl = () => {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return "";
  return new URL("/api/upload", baseUrl).toString();
};

const resolveMediaUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return url;
  return new URL(url, baseUrl).toString();
};

const Room = () => {
  const { code = "ROOM" } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>({ type: "none" });
  const [copied, setCopied] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  // user identity (demo) — stable id for sync deduping
  const [me] = useState(() => {
    const storageKey = "lumen-room-identity";
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { name?: string; color?: string; id?: string };
        if (parsed.name && parsed.color && parsed.id) {
          return { name: parsed.name, color: parsed.color, id: parsed.id };
        }
      }
    } catch {
      // Private modes can block storage; fall back to a one-page identity.
    }

    const name = `Гость-${Math.floor(Math.random() * 900 + 100)}`;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const id = crypto.randomUUID();
    const identity = { name, color, id };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(identity));
    } catch {
      // Ignore storage failures in private/incognito modes.
    }
    return identity;
  });

  // Live presence of other tabs in this room
  const [peers, setPeers] = useState<Record<string, { user: string; avatar: string; lastSeen: number }>>({});

  // chat
  const [messages, setMessages] = useState<Message[]>([
    { id: "s1", user: "system", avatar: "", text: `Комната ${code} создана. Откройте эту же ссылку в новой вкладке — синхронизация заработает автоматически ✨`, ts: Date.now(), system: true },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // playback
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  // Suppress local event re-broadcast when applying remote events
  const applyingRemoteRef = useRef(false);
  const syncLeaderRef = useRef<string | null>(null);
  const pendingRemotePlaybackRef = useRef<{ t: number; playing: boolean; until: number } | null>(null);
  const sourceRef = useRef<Source>(source);
  sourceRef.current = source;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ---- Sync setup ----
  const onSyncEvent = useCallback((e: SyncEvent) => {
    switch (e.kind) {
      case "hello":
      case "presence": {
        setPeers((p) => ({
          ...p,
          [e.from]: { user: e.user, avatar: e.avatar, lastSeen: e.at },
        }));
        if (e.kind === "hello") {
          // greet new peer with current state
          window.setTimeout(() => sendRef.current?.snapshot(), 50);
        }
        break;
      }
      case "leave": {
        setPeers((p) => { const n = { ...p }; delete n[e.from]; return n; });
        break;
      }
      case "source": {
        syncLeaderRef.current = e.from;
        const cur = sourceRef.current;
        if (e.source.type === "youtube") {
          if (cur.type !== "youtube" || cur.videoId !== e.source.videoId) {
            applyingRemoteRef.current = true;
            setSource({ type: "youtube", videoId: e.source.videoId });
            setProgress(0);
            setPlaying(false);
            setMessages((m) => [...m, sysMsg(`${peers[e.from]?.user ?? "Гость"} включил(а) видео с YouTube`)]);
          }
        } else if (e.source.type === "file") {
          if (cur.type !== "file" || cur.url !== e.source.url) {
            applyingRemoteRef.current = true;
            setSource({ type: "file", url: resolveMediaUrl(e.source.url), name: e.source.name });
            setProgress(0);
            setPlaying(false);
            setMessages((m) => [...m, sysMsg(`${peers[e.from]?.user ?? "Гость"} загрузил(а) файл «${e.source.name}»`)]);
          }
        }
        break;
      }
      case "play": {
        syncLeaderRef.current = e.from;
        applyRemotePlayback(e.t, true);
        break;
      }
      case "pause": {
        syncLeaderRef.current = e.from;
        applyRemotePlayback(e.t, false);
        break;
      }
      case "seek": {
        syncLeaderRef.current = e.from;
        applyRemotePlayback(e.t, playingRef.current);
        break;
      }
      case "tick": {
        syncLeaderRef.current = e.from;
        // Soft drift correction: avoid jitter from tiny player differences.
        const cur = currentTimeInternal();
        if (Math.abs(cur - e.t) > 4) {
          applyRemotePlayback(e.t, e.playing);
        }
        break;
      }
      case "state-snapshot": {
        if (e.source.type === "youtube") {
          syncLeaderRef.current = e.from;
          applyingRemoteRef.current = true;
          const cur = sourceRef.current;
          if (cur.type !== "youtube" || cur.videoId !== e.source.videoId) {
            setSource({ type: "youtube", videoId: e.source.videoId });
          }
          applyRemotePlayback(e.t, e.playing);
          window.setTimeout(() => { applyingRemoteRef.current = false; }, 1200);
        } else if (e.source.type === "file") {
          syncLeaderRef.current = e.from;
          applyingRemoteRef.current = true;
          const cur = sourceRef.current;
          const url = resolveMediaUrl(e.source.url);
          if (cur.type !== "file" || cur.url !== url) {
            setSource({ type: "file", url, name: e.source.name });
          }
          applyRemotePlayback(e.t, e.playing);
          window.setTimeout(() => { applyingRemoteRef.current = false; }, 1200);
        }
        break;
      }
      case "chat": {
        setMessages((m) => [...m, { id: e.id, user: e.user, avatar: e.avatar, text: e.text, ts: e.at }]);
        break;
      }
      case "state-request": {
        sendRef.current?.snapshot();
        break;
      }
    }
  }, [peers]);

  const { send } = useRoomSync(code, me.id, onSyncEvent);

  // Helpers + ref so we can call from event handler
  const sendRef = useRef<{ snapshot: () => void } | null>(null);
  useEffect(() => {
    sendRef.current = {
      snapshot: () => {
        if (syncLeaderRef.current && syncLeaderRef.current !== me.id) {
          return;
        }

        const src = sourceRef.current;
        const syncSrc: SyncSource =
          src.type === "youtube" ? { type: "youtube", videoId: src.videoId }
            : src.type === "file" ? { type: "file", name: src.name, url: src.url }
              : { type: "none" };
        send({
          kind: "state-snapshot",
          source: syncSrc,
          t: currentTimeInternal(),
          playing: playingRef.current,
        } as Omit<SyncEvent, "from" | "at">);
      },
    };
  }, [send]);

  // Hello on mount, leave on unmount
  useEffect(() => {
    send({ kind: "hello", user: me.name, avatar: me.color } as Omit<SyncEvent, "from" | "at">);
    send({ kind: "state-request" } as Omit<SyncEvent, "from" | "at">);
    const presenceId = window.setInterval(() => {
      send({ kind: "presence", user: me.name, avatar: me.color } as Omit<SyncEvent, "from" | "at">);
      // Mobile browsers can throttle timers, so keep presence tolerant.
      setPeers((p) => {
        const cutoff = Date.now() - 120000;
        const next: typeof p = {};
        for (const [k, v] of Object.entries(p)) if (v.lastSeen > cutoff) next[k] = v;
        return next;
      });
    }, 15000);
    return () => {
      window.clearInterval(presenceId);
    };
  }, [send, me.name, me.color]);

  // file <video> progress tracker
  useEffect(() => {
    if (source.type !== "file") return;
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setProgress(v.currentTime);
    const onMeta = () => setDuration(v.duration || 0);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [source]);

  // YT progress tracker
  useEffect(() => {
    if (source.type !== "youtube") return;
    const id = setInterval(async () => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        setProgress(await p.getCurrentTime());
        setDuration(await p.getDuration());
      } catch {/* noop */ }
    }, 500);
    return () => clearInterval(id);
  }, [source]);

  // Heartbeat tick: broadcast time to keep peers aligned
  useEffect(() => {
    if (source.type === "none") return;
    const id = window.setInterval(() => {
      if (!playingRef.current) return;
      if (syncLeaderRef.current && syncLeaderRef.current !== me.id) return;
      send({ kind: "tick", t: currentTimeInternal(), playing: true } as Omit<SyncEvent, "from" | "at">);
    }, 5000);
    return () => window.clearInterval(id);
  }, [source, send, me.id]);

  // ---- Internal player helpers (no broadcast) ----
  const currentTimeInternal = (): number => {
    if (sourceRef.current.type === "youtube" && ytPlayerRef.current) {
      try { return ytPlayerRef.current.getCurrentTime() as number; } catch { return progress; }
    }
    if (sourceRef.current.type === "file" && videoRef.current) {
      return videoRef.current.currentTime;
    }
    return progress;
  };
  const seekInternal = (t: number) => {
    if (sourceRef.current.type === "youtube" && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(t, true);
    } else if (sourceRef.current.type === "file" && videoRef.current) {
      videoRef.current.currentTime = t;
    }
  };
  const playInternal = () => {
    if (sourceRef.current.type === "youtube" && ytPlayerRef.current) ytPlayerRef.current.playVideo();
    else if (sourceRef.current.type === "file" && videoRef.current) videoRef.current.play().catch(() => { });
  };
  const pauseInternal = () => {
    if (sourceRef.current.type === "youtube" && ytPlayerRef.current) ytPlayerRef.current.pauseVideo();
    else if (sourceRef.current.type === "file" && videoRef.current) videoRef.current.pause();
  };

  const applyRemotePlayback = (t: number, shouldPlay: boolean) => {
    pendingRemotePlaybackRef.current = { t, playing: shouldPlay, until: Date.now() + 12000 };
    applyPendingRemotePlayback();
  };

  const applyPendingRemotePlayback = () => {
    const pending = pendingRemotePlaybackRef.current;
    if (!pending) return;

    const playerReady =
      sourceRef.current.type === "youtube"
        ? Boolean(ytPlayerRef.current)
        : sourceRef.current.type === "file"
          ? Boolean(videoRef.current)
          : false;

    setProgress(pending.t);
    setPlaying(pending.playing);

    if (!playerReady) {
      if (Date.now() < pending.until) {
        window.setTimeout(applyPendingRemotePlayback, 500);
      }
      return;
    }

    applyingRemoteRef.current = true;
    seekInternal(pending.t);
    if (pending.playing) playInternal();
    else pauseInternal();
    window.setTimeout(() => { applyingRemoteRef.current = false; }, 1200);
    pendingRemotePlaybackRef.current = null;
  };

  // ---- User actions (broadcast) ----
  const announce = (text: string) =>
    setMessages((m) => [...m, sysMsg(text)]);

  const handleSetYoutube = () => {
    const vid = extractYoutubeId(ytUrl);
    if (!vid) {
      toast.error("Не удалось распознать ссылку YouTube");
      return;
    }
    setSource({ type: "youtube", videoId: vid });
    syncLeaderRef.current = me.id;
    setYtUrl("");
    setPlaying(false);
    setProgress(0);
    announce(`${me.name} включил(а) видео с YouTube`);
    send({ kind: "source", source: { type: "youtube", videoId: vid } } as Omit<SyncEvent, "from" | "at">);
    toast.success("Видео загружено и синхронизировано");
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast.error("Это не видеофайл");
      return;
    }

    if (file.size > MAX_VIDEO_UPLOAD_SIZE) {
      toast.error("Файл должен быть не больше 512 МБ");
      return;
    }

    const uploadUrl = getUploadUrl();
    if (!uploadUrl) {
      toast.error("Файлы можно синхронизировать только через сервер Render");
      return;
    }

    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("video", file);
      const response = await fetch(uploadUrl, { method: "POST", body: form });
      if (!response.ok) {
        if (response.status === 413) {
          toast.error("Файл должен быть не больше 512 МБ");
          return;
        }

        throw new Error(`Upload failed with ${response.status}`);
      }

      const uploaded = await response.json() as { name: string; url: string };
      const url = resolveMediaUrl(uploaded.url);
      setSource({ type: "file", url, name: uploaded.name || file.name });
      syncLeaderRef.current = me.id;
      setPlaying(false);
      setProgress(0);
      announce(`${me.name} загрузил(а) файл «${uploaded.name || file.name}»`);
      send({
        kind: "source",
        source: { type: "file", name: uploaded.name || file.name, url: uploaded.url },
      } as Omit<SyncEvent, "from" | "at">);
      toast.success("Файл загружен и синхронизирован");
    } catch {
      toast.error("Не удалось загрузить файл на сервер");
    } finally {
      setUploadingFile(false);
    }
  };

  const togglePlay = () => {
    const next = !playing;
    syncLeaderRef.current = me.id;
    if (next) playInternal(); else pauseInternal();
    setPlaying(next);
    send({
      kind: next ? "play" : "pause",
      t: currentTimeInternal(),
    } as Omit<SyncEvent, "from" | "at">);
  };

  const seekTo = (val: number) => {
    syncLeaderRef.current = me.id;
    seekInternal(val);
    setProgress(val);
    send({ kind: "seek", t: val } as Omit<SyncEvent, "from" | "at">);
  };

  const restart = () => seekTo(0);

  const setVol = (v: number) => {
    setVolume(v);
    if (source.type === "youtube" && ytPlayerRef.current) ytPlayerRef.current.setVolume(v);
    else if (videoRef.current) videoRef.current.volume = v / 100;
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (source.type === "youtube" && ytPlayerRef.current) {
      if (next) {
        ytPlayerRef.current.mute();
      } else {
        ytPlayerRef.current.unMute();
      }
    } else if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  // Native player event guards: only broadcast if NOT applying remote
  const handleNativePlay = () => {
    setPlaying(true);
    if (applyingRemoteRef.current) return;
    syncLeaderRef.current = me.id;
    send({ kind: "play", t: currentTimeInternal() } as Omit<SyncEvent, "from" | "at">);
  };
  const handleNativePause = () => {
    setPlaying(false);
    if (applyingRemoteRef.current) return;
    syncLeaderRef.current = me.id;
    send({ kind: "pause", t: currentTimeInternal() } as Omit<SyncEvent, "from" | "at">);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const id = crypto.randomUUID();
    setMessages((m) => [...m, { id, user: me.name, avatar: me.color, text: chatInput.trim(), ts: Date.now() }]);
    send({
      kind: "chat",
      id,
      user: me.name,
      avatar: me.color,
      text: chatInput.trim(),
    } as Omit<SyncEvent, "from" | "at">);
    setChatInput("");
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success("Ссылка на комнату скопирована");
    setTimeout(() => setCopied(false), 1500);
  };

  const peerList = Object.values(peers);
  const onlineCount = peerList.length + 1;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-hero opacity-60" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-primary/15 blur-[140px]" aria-hidden />

      <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-5 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Film className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold">Люмен</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full glass px-4 py-2 text-sm md:flex">
              <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span className="text-muted-foreground">LIVE</span>
              <span className="font-semibold">{onlineCount}</span>
            </div>
            <button
              onClick={copyCode}
              className="group flex items-center gap-2 rounded-full glass px-4 py-2 text-sm transition-colors hover:border-primary/50"
            >
              <span className="text-muted-foreground">Код:</span>
              <span className="font-mono font-semibold tracking-[0.25em]">{code}</span>
              {copied
                ? <Check className="h-4 w-4 text-emerald-400" />
                : <Copy className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary-glow" />}
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-black shadow-elevated">
              <div className="aspect-video w-full">
                {source.type === "none" && <EmptyPlayer />}

                {source.type === "youtube" && (
                  <YouTube
                    videoId={source.videoId}
                    className="h-full w-full"
                    iframeClassName="h-full w-full"
                    opts={{
                      width: "100%",
                      height: "100%",
                      playerVars: { autoplay: 0, modestbranding: 1, rel: 0, controls: 1, playsinline: 1 },
                    }}
                    onReady={(e) => {
                      ytPlayerRef.current = e.target;
                      e.target.setVolume(volume);
                      applyPendingRemotePlayback();
                    }}
                    onPlay={handleNativePlay}
                    onPause={handleNativePause}
                    onEnd={() => setPlaying(false)}
                  />
                )}

                {source.type === "file" && (
                  <video
                    ref={videoRef}
                    src={source.url}
                    className="h-full w-full bg-black object-contain"
                    onPlay={handleNativePlay}
                    onPause={handleNativePause}
                    onEnded={() => setPlaying(false)}
                    controls={false}
                  />
                )}
              </div>

              {source.type !== "none" && (
                <div className="border-t border-white/5 bg-gradient-to-b from-black/0 to-black/60 p-4">
                  <SyncTimeline
                    current={progress}
                    duration={duration}
                    playing={playing}
                    onSeek={seekTo}
                    className="mb-4"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button onClick={togglePlay} size="icon" className="h-11 w-11 rounded-full bg-gradient-primary shadow-glow">
                        {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                      </Button>
                      <Button onClick={restart} variant="ghost" size="icon" className="rounded-full">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <div className="ml-2 flex items-center gap-2">
                        <Button onClick={toggleMute} variant="ghost" size="icon" className="rounded-full">
                          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </Button>
                        <div className="hidden w-28 sm:block">
                          <Slider value={[muted ? 0 : volume]} max={100} onValueChange={(v) => setVol(v[0])} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300 sm:inline-flex">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Синхронизировано · {onlineCount} зрителей
                      </span>
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold">Источник видео</h2>
                  <p className="text-xs text-muted-foreground">Откройте комнату в новой вкладке — управление синхронизировано</p>
                </div>
                {source.type !== "none" && (
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary-glow">
                    {source.type === "youtube" ? "YouTube" : source.name.slice(0, 24)}
                  </span>
                )}
              </div>

              <Tabs defaultValue="youtube" className="w-full">
                <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50 p-1">
                  <TabsTrigger value="youtube" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground">
                    <YoutubeIcon className="mr-2 h-4 w-4" /> YouTube
                  </TabsTrigger>
                  <TabsTrigger value="file" className="rounded-lg data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground">
                    <Upload className="mr-2 h-4 w-4" /> Файл
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="youtube" className="mt-4">
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSetYoutube(); }}
                    className="flex h-12 items-stretch overflow-hidden rounded-xl bg-input"
                  >
                    <div className="flex items-center pl-4 text-muted-foreground">
                      <LinkIcon className="h-4 w-4" />
                    </div>
                    <Input
                      value={ytUrl}
                      onChange={(e) => setYtUrl(e.target.value)}
                      placeholder="Вставьте ссылку YouTube или ID видео"
                      className="h-full flex-1 border-0 bg-transparent focus-visible:ring-0"
                    />
                    <Button type="submit" className="h-full rounded-none bg-gradient-primary px-5">
                      Загрузить
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="file" className="mt-4">
                  <FileDrop onFile={handleFile} disabled={uploadingFile} />
                  <p className="mt-3 text-xs text-muted-foreground">
                    Файл загружается на сервер комнаты, чтобы его могли смотреть все участники.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  В комнате
                </h3>
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  {onlineCount} онлайн
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <ViewerChip name={`${me.name} (вы)`} color={me.color} self />
                {peerList.map((v) => <ViewerChip key={v.user + v.avatar} name={v.user} color={v.avatar} />)}
                {peerList.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Откройте эту страницу в другой вкладке — зритель появится здесь автоматически.
                  </p>
                )}
              </div>
            </div>

            <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-3xl border border-border/60 bg-gradient-card shadow-soft">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-glow" />
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Чат сеанса</h3>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.map((m) => (
                  <ChatBubble key={m.id} m={m} isMe={m.user === me.name} />
                ))}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-border/50 p-3">
                <Button type="button" variant="ghost" size="icon" className="rounded-full text-muted-foreground">
                  <Smile className="h-4 w-4" />
                </Button>
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Напишите сообщение..."
                  className="h-11 flex-1 rounded-xl border-border/60 bg-input"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 rounded-xl bg-gradient-primary shadow-glow"
                  disabled={!chatInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const sysMsg = (text: string): Message => ({
  id: crypto.randomUUID(), user: "system", avatar: "", text, ts: Date.now(), system: true,
});

const EmptyPlayer = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-indigo-950 via-background to-black p-8 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30 animate-float">
      <Film className="h-8 w-8 text-primary-glow" />
    </div>
    <h3 className="font-display text-2xl font-semibold">Сеанс ещё не начался</h3>
    <p className="max-w-sm text-sm text-muted-foreground">
      Выберите источник ниже — вставьте ссылку YouTube или загрузите свой видеофайл.
    </p>
  </div>
);

const ViewerChip = ({ name, color, self }: { name: string; color: string; self?: boolean }) => (
  <div className={cn(
    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
    self ? "border-primary/50 bg-primary/10" : "border-border/60 bg-muted/40"
  )}>
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-background"
      style={{ background: color }}
    >
      {name[0]}
    </span>
    <span className="text-foreground/90">{name}</span>
  </div>
);

const ChatBubble = ({ m, isMe }: { m: Message; isMe: boolean }) => {
  if (m.system) {
    return (
      <div className="mx-auto w-fit rounded-full bg-muted/40 px-3 py-1 text-center text-xs text-muted-foreground">
        {m.text}
      </div>
    );
  }
  return (
    <div className={cn("flex items-start gap-2.5", isMe && "flex-row-reverse")}>
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-background"
        style={{ background: m.avatar }}
      >
        {m.user[0]}
      </span>
      <div className={cn("max-w-[80%]", isMe && "items-end text-right")}>
        <div className={cn("mb-1 text-[11px] text-muted-foreground", isMe && "text-right")}>
          {m.user}
        </div>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm leading-snug",
            isMe
              ? "bg-gradient-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted/60 text-foreground rounded-tl-sm"
          )}
        >
          {m.text}
        </div>
      </div>
    </div>
  );
};

const FileDrop = ({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) => {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-all",
        disabled && "pointer-events-none opacity-60",
        drag ? "border-primary bg-primary/10" : "border-border/60 bg-muted/30 hover:border-primary/50"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
        <Upload className="h-6 w-6 text-primary-glow" />
      </div>
      <p className="font-medium">{disabled ? "Файл загружается..." : "Перетащите видео сюда"}</p>
      <p className="text-xs text-muted-foreground">или нажмите, чтобы выбрать файл до 512 МБ (MP4, WebM, MOV)</p>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
};

export default Room;
