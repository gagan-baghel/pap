// Pure helpers shared by Convex functions and the Next.js app. No Convex imports here.

export const CATEGORIES = [
  { key: "coffee", label: "coffee", emoji: "☕", tint: "#F3E6D8" },
  { key: "food", label: "food", emoji: "🍜", tint: "#FBE3D6" },
  { key: "drinks", label: "drinks", emoji: "🍸", tint: "#E6F0D6" },
  { key: "badminton", label: "badminton", emoji: "🏸", tint: "#DCEAF8" },
  { key: "football", label: "football", emoji: "⚽", tint: "#DDF0E4" },
  { key: "tennis", label: "tennis", emoji: "🎾", tint: "#EDF6C9" },
  { key: "run", label: "running", emoji: "🏃", tint: "#FFE6DE" },
  { key: "cycle", label: "cycling", emoji: "🚲", tint: "#DFF0F7" },
  { key: "gym", label: "gym", emoji: "🏋️", tint: "#E6E3F6" },
  { key: "hike", label: "hiking", emoji: "🥾", tint: "#E2EEDA" },
  { key: "movie", label: "movies", emoji: "🎬", tint: "#EDE1F4" },
  { key: "gaming", label: "gaming", emoji: "🎮", tint: "#DEE3FA" },
  { key: "study", label: "study", emoji: "📚", tint: "#F6EED3" },
  { key: "cowork", label: "cowork", emoji: "💻", tint: "#E0ECF2" },
  { key: "music", label: "music", emoji: "🎸", tint: "#F8E0EA" },
  { key: "photo", label: "photo walk", emoji: "📷", tint: "#EAEAE4" },
  { key: "explore", label: "exploring", emoji: "🗺️", tint: "#DAEFEE" },
  { key: "event", label: "events", emoji: "🎟️", tint: "#FCE8CF" },
  { key: "network", label: "networking", emoji: "🤝", tint: "#E5EBF3" },
  { key: "hangout", label: "hanging out", emoji: "🛋️", tint: "#F2E6DF" },
  { key: "other", label: "something else", emoji: "✨", tint: "#ECECF3" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const category = (key: string) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];

/**
 * Guesses a category from what someone typed. Word boundaries matter: without them
 * "creator meetup" matches /eat/ (food) and "brunch" matches /run/ (running).
 * First match wins, so the list is ordered most-specific first.
 */
const KEYWORDS: [RegExp, string][] = [
  [/\b(badminton|shuttle)\b/i, "badminton"],
  [/\b(football|soccer|turf|5-a-side)\b/i, "football"],
  [/\btennis\b/i, "tennis"],
  [/\b(cycl\w*|bike|biking|bicycle)\b/i, "cycle"],
  [/\b(run|runs|running|jog\w*|5k|10k|marathon)\b/i, "run"],
  [/\b(gym|lift|lifting|workout|leg day)\b/i, "gym"],
  [/\b(hike|hiking|trek\w*|trail)\b/i, "hike"],
  [/\b(movie|movies|film|cinema)\b/i, "movie"],
  [/\b(gaming|game|games|chess|ps5|xbox)\b/i, "gaming"],
  [/\b(study|exam|revision|library)\b/i, "study"],
  [/\b(cowork\w*|laptop|deep work)\b/i, "cowork"],
  [/\b(gig|concert|open mic|music|jam)\b/i, "music"],
  [/\b(photo\w*|camera|shoot)\b/i, "photo"],
  [/\b(meetup|network\w*|founders|builders|creators?)\b/i, "network"],
  [/\b(coffee|caf[eé]|latte|chai|espresso)\b/i, "coffee"],
  [/\b(beer|drinks|pub|bar|cocktail)\b/i, "drinks"],
  [/\b(dinner|lunch|brunch|breakfast|food|eat|ramen|dosa|pizza|noodles)\b/i, "food"],
  [/\b(walk|explore|wander|market)\b/i, "explore"],
];

export const guessCategory = (title: string) => KEYWORDS.find(([re]) => re.test(title))?.[1];

export const AVAILABILITY = [
  { key: "mornings", label: "early mornings", emoji: "🌅" },
  { key: "lunch", label: "lunch breaks", emoji: "🥪" },
  { key: "evenings", label: "weekday evenings", emoji: "🌆" },
  { key: "late", label: "late nights", emoji: "🌙" },
  { key: "weekends", label: "weekends", emoji: "🛼" },
  { key: "spontaneous", label: "last-minute anything", emoji: "⚡" },
] as const;

export const HEARD_FROM = [
  { key: "tiktok", label: "tiktok", emoji: "🎵" },
  { key: "instagram", label: "instagram", emoji: "📸" },
  { key: "x", label: "twitter/x", emoji: "🐦" },
  { key: "friend", label: "a friend", emoji: "👯" },
  { key: "plan", label: "someone shared a plan", emoji: "🔗" },
  { key: "irl", label: "irl", emoji: "👀" },
  { key: "other", label: "other", emoji: "🌐" },
] as const;

export const AVATAR_COLORS = ["#FFD6A5", "#CAFFBF", "#9BF6FF", "#BDB2FF", "#FFC6FF", "#FDFFB6", "#A0C4FF", "#FFADAD"];

export const REPORT_REASONS = [
  "spam or scam",
  "fake profile",
  "made me feel unsafe",
  "harassment or hate",
  "inappropriate content",
  "didn't show / misleading plan",
  "something else",
];

// ---------- geo ----------

// 0.25° grid cells (~28km). Plans are indexed by cell so discovery only ever reads
// the handful of cells around the viewer — works the same for one city or the whole world.
export const CELL = 0.25;
export const cellOf = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

export function cellsAround(lat: number, lng: number, radiusKm: number) {
  const r = Math.max(1, Math.ceil(radiusKm / 27));
  const cy = Math.floor(lat / CELL);
  const cx = Math.floor(lng / CELL);
  const out: string[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) out.push(`${cy + dy}:${cx + dx}`);
  return out;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const formatDistance = (km: number) =>
  km < 1 ? `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;

// ~1km rounding for anything we store or show about where a person (not a venue) is
export const approx = (n: number) => Math.round(n * 100) / 100;

// ---------- time ----------

export type Phase = "cancelled" | "ended" | "live" | "soon" | "upcoming";

export function planPhase(p: { status: string; startAt: number; endAt: number }, now = Date.now()): Phase {
  if (p.status === "cancelled") return "cancelled";
  if (now >= p.endAt) return "ended";
  if (now >= p.startAt) return "live";
  if (p.startAt - now <= 60 * 60 * 1000) return "soon";
  return "upcoming";
}

const fmt = (t: number, tz: string | undefined, o: Intl.DateTimeFormatOptions) => {
  try {
    return new Date(t).toLocaleString("en-US", { ...o, timeZone: tz });
  } catch {
    return new Date(t).toLocaleString("en-US", o);
  }
};

export const clock = (t: number, tz?: string) =>
  fmt(t, tz, { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(/\s/g, "").toLowerCase();

const dayKey = (t: number, tz?: string) => fmt(t, tz, { year: "numeric", month: "numeric", day: "numeric" });

export function formatWhen(start: number, now = Date.now(), tz?: string) {
  const mins = Math.round((start - now) / 60000);
  if (mins <= 0 && mins > -2) return "right now";
  if (mins > 0 && mins < 60) return `in ${mins} min`;
  const t = clock(start, tz);
  const hour = Number(fmt(start, tz, { hour: "numeric", hour12: false }));
  if (dayKey(start, tz) === dayKey(now, tz)) return hour >= 17 ? `tonight ${t}` : `today ${t}`;
  if (dayKey(start, tz) === dayKey(now + 864e5, tz)) return `tomorrow ${t}`;
  if (start > now && start - now < 6 * 864e5) return `${fmt(start, tz, { weekday: "short" }).toLowerCase()} ${t}`;
  return `${fmt(start, tz, { day: "numeric", month: "short" }).toLowerCase()} ${t}`;
}

/** Same as formatWhen, but a plan that's already running says so in human terms. */
export function formatWhenRange(start: number, end: number, now = Date.now(), tz?: string) {
  if (now >= start && now < end) {
    const mins = Math.round((now - start) / 60000);
    if (mins < 1) return "started just now";
    if (mins < 60) return `started ${mins} min ago`;
    return `on now · until ${clock(end, tz)}`;
  }
  return formatWhen(start, now, tz);
}

export function formatDuration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}

export function timeAgo(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function formatCost(cost: number, currency = "INR") {
  if (!cost) return "free";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(cost);
  } catch {
    return `${cost} ${currency}`;
  }
}

// Reliability is only shown once there's enough history to mean something.
export function reliability(u: { attended?: number; noShows?: number; lateCancels?: number }) {
  const a = u.attended ?? 0;
  const bad = (u.noShows ?? 0) + (u.lateCancels ?? 0) * 0.5;
  if (a + (u.noShows ?? 0) + (u.lateCancels ?? 0) < 3) return null;
  return Math.round((a / (a + bad)) * 100);
}

export const threadKeyForPlan = (planId: string) => `p:${planId}`;
export const threadKeyForDm = (a: string, b: string) => `d:${[a, b].sort().join(":")}`;
