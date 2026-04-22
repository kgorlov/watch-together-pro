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
const fakeNames = ["Мия", "Артур", "Лена", "Кай", "Соня"];

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

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const Room = () => {
  const { code = "ROOM" } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>({ type: "none" });
  const [copied, setCopied] = useState(false);
  const [ytUrl, setYtUrl] = useState("");

  // user identity (demo)
  const [me] = useState(() => {
    const name = `Гость-${Math.floor(Math.random() * 900 + 100)}`;
    const color = palette[Math.floor(Math.random() * palette.length)];
    return { name, color };
  });

  // viewers (demo)
  const [viewers] = useState(() => {
    const others = fakeNames.slice(0, 3 + Math.floor(Math.random() * 2)).map((n, i) => ({
      name: n,
      color: palette[(i + 1) % palette.length],
    }));
    return others;
  });

  // chat
  const [messages, setMessages] = useState<Message[]>([
    { id: "s1", user: "system", avatar: "", text: `Комната ${code} создана. Поделитесь кодом с друзьями ✨`, ts: Date.now(), system: true },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // playback state for video element / YT player
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Simulated incoming chat messages from other "viewers"
  useEffect(() => {
    const lines = [
      "Привет всем 👋",
      "Качество огонь",
      "Жду начала!",
      "Можем перемотать на начало?",
      "ахаха момент",
      "🎬🍿",
    ];
    const id = setInterval(() => {
      if (Math.random() < 0.35) {
        const v = viewers[Math.floor(Math.random() * viewers.length)];
        if (!v) return;
        const text = lines[Math.floor(Math.random() * lines.length)];
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), user: v.name, avatar: v.color, text, ts: Date.now() },
        ]);
      }
    }, 9000);
    return () => clearInterval(id);
  }, [viewers]);

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
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [source]);

  const announce = (text: string) =>
    setMessages((m) => [...m, { id: crypto.randomUUID(), user: "system", avatar: "", text, ts: Date.now(), system: true }]);

  const handleSetYoutube = () => {
    const vid = extractYoutubeId(ytUrl);
    if (!vid) {
      toast.error("Не удалось распознать ссылку YouTube");
      return;
    }
    setSource({ type: "youtube", videoId: vid });
    setYtUrl("");
    setPlaying(false);
    announce(`${me.name} включил(а) видео с YouTube`);
    toast.success("Видео загружено и синхронизировано");
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast.error("Это не видеофайл");
      return;
    }
    const url = URL.createObjectURL(file);
    setSource({ type: "file", url, name: file.name });
    setPlaying(false);
    announce(`${me.name} загрузил(а) файл «${file.name}»`);
    toast.success("Файл готов к просмотру");
  };

  const togglePlay = () => {
    if (source.type === "youtube") {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (playing) p.pauseVideo(); else p.playVideo();
    } else if (source.type === "file" && videoRef.current) {
      const v = videoRef.current;
      if (playing) v.pause(); else v.play();
    }
    setPlaying((s) => !s);
    announce(`${me.name} ${playing ? "поставил(а) на паузу" : "включил(а) воспроизведение"}`);
  };

  const seekTo = (val: number) => {
    if (source.type === "youtube" && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(val, true);
    } else if (source.type === "file" && videoRef.current) {
      videoRef.current.currentTime = val;
    }
    setProgress(val);
  };

  const restart = () => seekTo(0);

  const setVol = (v: number) => {
    setVolume(v);
    if (source.type === "youtube" && ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(v);
    } else if (videoRef.current) {
      videoRef.current.volume = v / 100;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (source.type === "youtube" && ytPlayerRef.current) {
      next ? ytPlayerRef.current.mute() : ytPlayerRef.current.unMute();
    } else if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), user: me.name, avatar: me.color, text: chatInput.trim(), ts: Date.now() },
    ]);
    setChatInput("");
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Код скопирован");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* ambient bg */}
      <div className="pointer-events-none absolute inset-0 bg-hero opacity-60" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-primary/15 blur-[140px]" aria-hidden />

      <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-5 lg:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <Film className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold">Lumen</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full glass px-4 py-2 text-sm md:flex">
              <Users className="h-4 w-4 text-primary-glow" />
              <span className="text-muted-foreground">Зрителей:</span>
              <span className="font-semibold">{viewers.length + 1}</span>
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

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Player column */}
          <div className="space-y-5">
            {/* Player surface */}
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
                      playerVars: { autoplay: 0, modestbranding: 1, rel: 0 },
                    }}
                    onReady={(e) => {
                      ytPlayerRef.current = e.target;
                      e.target.setVolume(volume);
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnd={() => setPlaying(false)}
                  />
                )}

                {source.type === "file" && (
                  <video
                    ref={videoRef}
                    src={source.url}
                    className="h-full w-full bg-black object-contain"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    controls={false}
                  />
                )}
              </div>

              {/* Custom controls */}
              {source.type !== "none" && (
                <div className="border-t border-white/5 bg-gradient-to-b from-black/0 to-black/60 p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="w-12 text-xs tabular-nums text-muted-foreground">{formatTime(progress)}</span>
                    <Slider
                      value={[progress]}
                      max={Math.max(duration, 1)}
                      step={0.5}
                      onValueChange={(v) => seekTo(v[0])}
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{formatTime(duration)}</span>
                  </div>
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
                        Синхронизировано
                      </span>
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Source picker */}
            <div className="rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold">Источник видео</h2>
                  <p className="text-xs text-muted-foreground">Доступно всем зрителям комнаты</p>
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
                  <FileDrop onFile={handleFile} />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Sidebar: viewers + chat */}
          <aside className="flex flex-col gap-5">
            {/* Viewers */}
            <div className="rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-soft">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  В комнате
                </h3>
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  {viewers.length + 1} онлайн
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <ViewerChip name={`${me.name} (вы)`} color={me.color} self />
                {viewers.map((v) => <ViewerChip key={v.name} name={v.name} color={v.color} />)}
              </div>
            </div>

            {/* Chat */}
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

const FileDrop = ({ onFile }: { onFile: (f: File) => void }) => {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-all",
        drag ? "border-primary bg-primary/10" : "border-border/60 bg-muted/30 hover:border-primary/50"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
        <Upload className="h-6 w-6 text-primary-glow" />
      </div>
      <p className="font-medium">Перетащите видео сюда</p>
      <p className="text-xs text-muted-foreground">или нажмите, чтобы выбрать файл (MP4, WebM, MOV)</p>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
};

export default Room;
