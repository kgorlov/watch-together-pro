import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SyncTimelineProps {
  current: number;
  duration: number;
  buffered?: number; // 0..duration, optional buffer marker
  playing: boolean;
  onSeek: (time: number) => void;
  className?: string;
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

/**
 * Interactive cinema-style timeline.
 * - Hover preview tooltip
 * - Click / drag to seek
 * - Animated "syncing" pulse after a seek confirms
 */
export const SyncTimeline = ({
  current,
  duration,
  buffered = 0,
  playing,
  onSeek,
  className,
}: SyncTimelineProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const safeDuration = Math.max(duration, 0.0001);
  const pct = Math.min(100, (current / safeDuration) * 100);
  const bufferPct = Math.min(100, (buffered / safeDuration) * 100);

  const xToTime = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    return (x / r.width) * safeDuration;
  };

  const triggerSyncPulse = () => {
    setSyncing(true);
    window.clearTimeout((triggerSyncPulse as any)._t);
    (triggerSyncPulse as any)._t = window.setTimeout(() => setSyncing(false), 900);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    const t = xToTime(e.clientX);
    onSeek(t);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setHoverX(Math.max(0, Math.min(r.width, e.clientX - r.left)));
    if (dragging) {
      onSeek(xToTime(e.clientX));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragging) {
      onSeek(xToTime(e.clientX));
      triggerSyncPulse();
    }
    setDragging(false);
  };

  // Pulse when current time jumps from external source (sync from another tab)
  const lastReportedRef = useRef(current);
  useEffect(() => {
    const delta = Math.abs(current - lastReportedRef.current);
    // Detect a jump that wasn't a tiny normal tick (~0.5s @ 500ms interval)
    if (delta > 1.5) triggerSyncPulse();
    lastReportedRef.current = current;
  }, [current]);

  const hoverTime = hoverX !== null && trackRef.current
    ? (hoverX / trackRef.current.getBoundingClientRect().width) * safeDuration
    : null;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="w-12 text-xs tabular-nums text-muted-foreground">
        {fmt(current)}
      </span>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { setHoverX(null); }}
        className="group relative h-8 flex-1 cursor-pointer touch-none select-none"
      >
        {/* Track */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-muted/60 transition-all group-hover:h-2.5">
            {/* Buffered */}
            {bufferPct > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-foreground/15"
                style={{ width: `${bufferPct}%` }}
              />
            )}
            {/* Progress */}
            <div
              className={cn(
                "absolute inset-y-0 left-0 bg-gradient-primary transition-[width]",
                dragging ? "duration-0" : "duration-150"
              )}
              style={{ width: `${pct}%` }}
            />
            {/* Shimmer when syncing */}
            {syncing && (
              <div
                className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,transparent,hsl(var(--primary-glow)/0.6),transparent)] bg-[length:200%_100%]"
                style={{
                  width: `${pct}%`,
                  animation: "shimmer 0.9s ease-out",
                }}
              />
            )}
          </div>
        </div>

        {/* Knob */}
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform",
            "h-3.5 w-3.5 rounded-full bg-primary-glow shadow-glow ring-4 ring-primary/30",
            (dragging || hoverX !== null) && "scale-125",
            playing && "animate-pulse-glow"
          )}
          style={{ left: `${pct}%` }}
        />

        {/* Hover preview */}
        {hoverTime !== null && hoverX !== null && (
          <div
            className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-md glass px-2 py-1 text-[11px] font-mono tabular-nums shadow-soft"
            style={{ left: `${hoverX}px` }}
          >
            {fmt(hoverTime)}
          </div>
        )}

        {/* Sync confirmation badge */}
        {syncing && (
          <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300 animate-fade-up">
            ⟳ Синхронизация подтверждена
          </div>
        )}
      </div>

      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
        {fmt(duration)}
      </span>
    </div>
  );
};
