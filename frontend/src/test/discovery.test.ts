import { describe, it, expect } from "vitest";
import {
  filterFeed,
  isLaunching,
  validateComment,
  removeCommentThread,
  MAX_REPLY_DEPTH,
  currentStage,
  canReplyTo,
} from "@/lib/discovery";
import { businesses, launches } from "@/lib/demo";
describe("Redesign discovery behavior", () => {
  it("does not leave a past-day fixture labelled Launching Today", () => {
    const launch = launches[0];
    if (!launch) throw new Error("Missing launch fixture");
    expect(
      currentStage(
        { ...launch, stage: "Launching Today", startsAt: "2026-10-23T05:30:00Z" },
        Date.parse("2026-10-24T03:00:00Z"),
      ),
    ).toBe("Live");
    expect(
      currentStage(
        { ...launch, stage: "Launching Today", startsAt: "2026-10-24T01:00:00Z" },
        Date.parse("2026-10-24T03:00:00Z"),
      ),
    ).toBe("Launching Today");
  });
  it("never treats a future launch as launching now", () => {
    const launch = launches[0];
    if (!launch) throw new Error("Missing launch fixture");
    expect(
      isLaunching(
        { ...launch, stage: "Live", startsAt: "2027-01-01T00:00:00Z" },
        Date.parse("2026-10-24T00:00:00Z"),
      ),
    ).toBe(false);
    expect(
      isLaunching(
        { ...launch, stage: "Live", startsAt: "2026-10-01T00:00:00Z" },
        Date.parse("2026-10-24T00:00:00Z"),
      ),
    ).toBe(true);
  });
  it("filters Following by followed businesses and applies city/category constraints", () => {
    expect(
      filterFeed(
        launches,
        businesses,
        ["business:kasavu-thread"],
        "following",
        "Kochi",
        "Handloom & Textiles",
      ).map((l) => l.slug),
    ).toEqual(["kasavu-everyday"]);
    expect(filterFeed(launches, businesses, [], "following", "", "")).toEqual([]);
  });
  it("Nearby requires an explicit city and excludes online-only businesses", () => {
    expect(filterFeed(launches, businesses, [], "nearby", "", "")).toEqual([]);
    expect(filterFeed(launches, businesses, [], "nearby", "Hyderabad", "")).toEqual([]);
    expect(filterFeed(launches, businesses, [], "nearby", "Kochi", "").map((l) => l.slug)).toEqual([
      "kasavu-everyday",
    ]);
  });
  it("accepts at most 1000 characters per comment", () => {
    expect(validateComment("a".repeat(1000))).toBe("");
    expect(validateComment("a".repeat(1001))).not.toBe("");
    expect(validateComment(" ")).not.toBe("");
  });
  it("limits nested reply controls to two levels", () => {
    expect(MAX_REPLY_DEPTH).toBe(2);
    const thread = [
      { id: "root" },
      { id: "reply", parentId: "root" },
      { id: "child", parentId: "reply" },
    ];
    expect(canReplyTo(thread, "root")).toBe(true);
    expect(canReplyTo(thread, "reply")).toBe(true);
    expect(canReplyTo(thread, "child")).toBe(false);
    expect(canReplyTo(thread, "deleted")).toBe(false);
  });
  it("deletes all descendants but preserves unrelated comments", () => {
    const base = { launchSlug: "x", author: "Member", text: "Hello", at: "2026-10-24T00:00:00Z" };
    const comments = [
      { ...base, id: "root" },
      { ...base, id: "reply", parentId: "root" },
      { ...base, id: "child", parentId: "reply" },
      { ...base, id: "other" },
    ];
    expect(removeCommentThread(comments, "root").map((c) => c.id)).toEqual(["other"]);
  });
});
