import type { Business, Launch } from "./demo";
import type { Comment } from "./store";

export const feedModes = ["for-you", "following", "launching", "trending", "nearby"] as const;
export type FeedMode = (typeof feedModes)[number];
export function currentStage(launch: Launch, now = Date.now()): Launch["stage"] {
  if (launch.stage !== "Launching Today") return launch.stage;
  const start = new Date(launch.startsAt).getTime();
  if (!Number.isFinite(start)) return "Coming Soon";
  if (start > now) return "Coming Soon";
  const day = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return day(start) === day(now) ? "Launching Today" : "Live";
}
export function isLaunching(launch: Launch, now = Date.now()) {
  const start = new Date(launch.startsAt).getTime();
  return start <= now && ["Live", "Launching Today", "Trending"].includes(launch.stage);
}
export function filterFeed(
  launches: Launch[],
  businesses: Business[],
  follows: string[],
  mode: FeedMode,
  city: string,
  category: string,
  now = Date.now(),
) {
  return launches.filter((l) => {
    const b = businesses.find((b) => b.slug === l.businessSlug);
    if (!b || (city && b.city !== city) || (category && b.category !== category)) return false;
    if (mode === "following")
      return follows.some((id) =>
        [`business:${b.slug}`, `founder:${b.founderSlug}`, `category:${b.category}`].includes(id),
      );
    if (mode === "launching") return isLaunching(l, now);
    if (mode === "trending") return l.stage === "Trending";
    if (mode === "nearby") return !!city && b.mode !== "online";
    return true;
  });
}
export const COMMENT_LIMIT = 1000;
export const MAX_REPLY_DEPTH = 2;
export function canReplyTo(comments: Pick<Comment, "id" | "parentId">[], id: string) {
  let current = comments.find((c) => c.id === id);
  if (!current) return false;
  const seen = new Set<string>();
  let depth = 0;
  while (current.parentId) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    depth++;
    current = comments.find((c) => c.id === current?.parentId);
    if (!current) return false;
  }
  return depth < MAX_REPLY_DEPTH;
}
export function validateComment(text: string) {
  if (text.trim().length < 2) return "Write at least 2 characters.";
  if (text.trim().length > COMMENT_LIMIT) return "Keep comments to 1000 characters.";
  return "";
}
export function removeCommentThread(comments: Comment[], id: string) {
  const ids = new Set([id]);
  let previous = 0;
  while (ids.size !== previous) {
    previous = ids.size;
    comments.forEach((c) => {
      if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
    });
  }
  return comments.filter((c) => !ids.has(c.id));
}
