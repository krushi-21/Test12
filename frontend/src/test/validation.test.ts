import { describe, expect, it } from "vitest";
import {
  isHttps,
  validateImage,
  validateSchedule,
  toIst,
  canManage,
  canReview,
} from "@/lib/validation";

describe("Launch readiness validation", () => {
  it("only permits verified non-owners to review a business", () => {
    expect(canReview(null, "meera-iyer")).toBe(false);
    expect(canReview({ verified: false, founderSlug: "sana-qureshi" }, "meera-iyer")).toBe(false);
    expect(canReview({ verified: true, founderSlug: "meera-iyer" }, "meera-iyer")).toBe(false);
    expect(canReview({ verified: true, founderSlug: "sana-qureshi" }, "meera-iyer")).toBe(true);
  });
  it("requires matching owner identity for workspace editing", () => {
    expect(canManage(undefined, "meera-iyer")).toBe(false);
    expect(canManage("sana-qureshi", "meera-iyer")).toBe(false);
    expect(canManage("meera-iyer", "meera-iyer")).toBe(true);
  });
  it("rejects unsafe and reserved outbound destinations", () => {
    expect(isHttps("javascript:alert(1)")).toBe(false);
    expect(isHttps("http://example.org")).toBe(false);
    expect(isHttps("https://shop.invalid/item")).toBe(false);
    expect(isHttps("https://user:pass@example.org")).toBe(false);
    expect(isHttps("https://example.org/item")).toBe(true);
  });
  it("keeps image previews within the 5 MB limit", () => {
    expect(validateImage({ type: "image/png", size: 5_000_000 })).toBe("");
    expect(validateImage({ type: "image/png", size: 5_000_001 })).not.toBe("");
    expect(validateImage({ type: "image/svg+xml", size: 200 })).not.toBe("");
  });
  it("interprets local launch times in Asia/Kolkata", () => {
    expect(toIst("2026-10-23T09:00")).toBe("2026-10-23T09:00:00+05:30");
    expect(new Date(toIst("2026-10-23T09:00")).toISOString()).toBe("2026-10-23T03:30:00.000Z");
  });
  it("requires a valid start and a strictly later end", () => {
    expect(validateSchedule("bad")).not.toBe("");
    expect(validateSchedule("2026-10-23T09:00", "2026-10-23T09:00")).not.toBe("");
    expect(validateSchedule("2026-10-23T09:00", "2026-10-23T10:00")).toBe("");
  });
});
