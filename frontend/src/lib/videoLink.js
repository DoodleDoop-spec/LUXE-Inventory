/**
 * Parse a timestamp string ("1:23", "1:23:45", or plain seconds) into total seconds.
 * Returns 0 for empty / invalid input.
 */
export function parseTimestampSeconds(ts) {
  if (!ts) return 0;
  const s = String(ts).trim();
  if (!s) return 0;
  // Plain number of seconds
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // hh:mm:ss or mm:ss
  const parts = s.split(":").map((p) => parseInt(p.trim(), 10));
  if (parts.some((n) => isNaN(n) || n < 0)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Return a URL that starts playback at the given timestamp for known providers
 * (YouTube, Vimeo). For unknown hosts, appends #t=Xs.
 * Passing 0 or empty timestamp returns the original URL unchanged.
 */
export function buildTimestampedUrl(rawUrl, timestamp) {
  if (!rawUrl) return "";
  const seconds = parseTimestampSeconds(timestamp);
  if (!seconds) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    // YouTube
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      url.searchParams.set("t", `${seconds}s`);
      return url.toString();
    }
    // Vimeo
    if (host.includes("vimeo.com")) {
      const h = url.hash.replace(/#t=[^&]*/, "");
      const hMin = Math.floor(seconds / 60);
      const hSec = seconds % 60;
      url.hash = (h ? h + "&" : "#") + `t=${hMin}m${hSec}s`;
      return url.toString();
    }
    // Generic fallback
    url.hash = `t=${seconds}`;
    return url.toString();
  } catch {
    return rawUrl;
  }
}
