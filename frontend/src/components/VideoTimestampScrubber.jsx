import { useEffect, useRef, useState } from "react";
import { Play, Clock, ChevronDown, ChevronUp } from "lucide-react";

// Parse YouTube video ID from various URL formats
function parseYouTubeId(url) {
  if (!url) return null;
  const s = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}

// Parse timestamp like "12:34", "1:23:45", or "76" (seconds) → seconds int
function parseTimestampSeconds(ts) {
  if (!ts) return 0;
  const s = String(ts).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

let ytApiPromise = null;
function loadYouTubeAPI() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
  });
  return ytApiPromise;
}

/**
 * VideoTimestampScrubber — Embeds a YouTube video below the timestamp input and
 * exposes a "Capture current time" button that writes the current playhead into
 * the parent's timestamp state.
 */
export default function VideoTimestampScrubber({ videoUrl, timestamp, onTimestampChange, testIdPrefix = "vts" }) {
  const [open, setOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(parseTimestampSeconds(timestamp));
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const pollRef = useRef(null);

  const videoId = parseYouTubeId(videoUrl);

  useEffect(() => {
    if (!open || !videoId || !containerRef.current) return undefined;
    let cancelled = false;
    setReady(false);
    (async () => {
      const YT = await loadYouTubeAPI();
      if (cancelled) return;
      // Destroy any prior player
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch { /* noop */ }
      }
      containerRef.current.innerHTML = "";
      const div = document.createElement("div");
      containerRef.current.appendChild(div);
      const startSec = parseTimestampSeconds(timestamp);
      playerRef.current = new YT.Player(div, {
        videoId,
        playerVars: { start: startSec, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            setReady(true);
            // Poll current time so the button always shows the live playhead
            pollRef.current = setInterval(() => {
              try {
                const t = playerRef.current?.getCurrentTime?.();
                if (typeof t === "number") setCurrentTime(t);
              } catch { /* noop */ }
            }, 500);
          },
        },
      });
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch { /* noop */ }
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId]);

  const capture = () => {
    const secs = Math.max(0, Math.floor(currentTime));
    onTimestampChange(formatSeconds(secs));
  };

  const jumpToTimestamp = () => {
    if (!ready || !playerRef.current) return;
    const secs = parseTimestampSeconds(timestamp);
    try { playerRef.current.seekTo(secs, true); playerRef.current.playVideo(); } catch { /* noop */ }
  };

  if (!videoId) {
    return (
      <div className="text-[10px] font-mono-label tracking-widest text-[#71717A] mt-1" data-testid={`${testIdPrefix}-unsupported`}>
        SCRUBBER: PASTE A YOUTUBE LINK ABOVE TO ENABLE
      </div>
    );
  }

  return (
    <div className="mt-1" data-testid={`${testIdPrefix}-root`}>
      <button
        type="button"
        data-testid={`${testIdPrefix}-toggle`}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[11px] font-mono-label tracking-widest text-[#09090B] hover:underline"
      >
        <Play className="h-3 w-3" />
        {open ? "HIDE VIDEO SCRUBBER" : "OPEN VIDEO SCRUBBER"}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 border border-[#E4E4E7] bg-[#FAFAFA] p-2 space-y-2">
          <div ref={containerRef} className="aspect-video w-full bg-black" data-testid={`${testIdPrefix}-player`} />
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-mono-label text-[10px] tracking-widest text-[#71717A]">
              PLAYHEAD:
            </span>
            <span className="tabular-nums font-medium text-[#09090B]" data-testid={`${testIdPrefix}-current`}>
              {formatSeconds(currentTime)}
            </span>
            <button
              type="button"
              data-testid={`${testIdPrefix}-capture`}
              onClick={capture}
              disabled={!ready}
              className="ml-auto inline-flex items-center gap-1 border border-[#09090B] bg-[#09090B] text-white hover:bg-[#27272A] disabled:opacity-50 px-3 py-1 text-xs"
            >
              <Clock className="h-3 w-3" /> Capture time
            </button>
            <button
              type="button"
              data-testid={`${testIdPrefix}-jump`}
              onClick={jumpToTimestamp}
              disabled={!ready || !timestamp}
              className="inline-flex items-center gap-1 border border-[#E4E4E7] bg-white text-[#09090B] hover:border-[#09090B] disabled:opacity-50 px-3 py-1 text-xs"
            >
              Jump to saved
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
