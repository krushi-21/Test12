export function isHttps(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hostname.endsWith(".invalid")
    );
  } catch {
    return false;
  }
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function canReview(
  user: { verified: boolean; founderSlug?: string } | null,
  ownerSlug: string,
) {
  return !!user?.verified && user.founderSlug !== ownerSlug;
}

export function canManage(founderSlug: string | undefined, businessOwnerSlug: string) {
  return !!founderSlug && founderSlug === businessOwnerSlug;
}

export function validateSchedule(startsAt: string, endsAt?: string) {
  const start = new Date(`${startsAt}+05:30`).getTime();
  if (!Number.isFinite(start)) return "Pick a valid start time.";
  if (
    endsAt &&
    (!Number.isFinite(new Date(`${endsAt}+05:30`).getTime()) ||
      new Date(`${endsAt}+05:30`).getTime() <= start)
  )
    return "End must be after start.";
  return "";
}

export function validateImage(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "Choose a JPG, PNG or WebP image.";
  if (file.size > 5_000_000) return "Each image must be 5 MB or smaller.";
  return "";
}

export const toIst = (date: string) => (date.length === 16 ? `${date}:00+05:30` : date);
export const formatDate = (date: string) =>
  new Date(toIst(date)).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
