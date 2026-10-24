import { describe, expect, it } from "vitest";
import { displayedComments, displayedReviews, reviewAverage } from "@/lib/activity";
import { sampleComments, sampleReviews } from "@/lib/demo";

describe("Displayed preview activity", () => {
  it("counts exactly the displayed fixture and local comments", () => {
    const local = [
      {
        id: "local",
        launchSlug: "deccan-tasting-box",
        author: "Preview member",
        text: "Hello",
        at: "2026-10-24T00:00:00Z",
      },
    ];
    const list = displayedComments("deccan-tasting-box", local);
    expect(list).toHaveLength(sampleComments.length + 1);
    expect(list.filter((c) => c.sample)).toHaveLength(sampleComments.length);
    expect(displayedComments("new-launch", local)).toHaveLength(0);
  });
  it("derives ratings only from the displayed reviews and handles no reviews", () => {
    expect(displayedReviews("kasavu-thread", [])).toHaveLength(sampleReviews.length);
    expect(reviewAverage(displayedReviews("kasavu-thread", []))).toBe(4.5);
    expect(reviewAverage(displayedReviews("new-business", []))).toBeNull();
  });
});
