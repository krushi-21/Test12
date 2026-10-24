import { businesses, launches, sampleComments, sampleReviews } from "./demo";
import type { Comment, Review } from "./store";

export function displayedComments(slug: string, local: Comment[]) {
  return [
    ...local.filter((c) => c.launchSlug === slug).map((c) => ({ ...c, sample: false })),
    ...(launches.some((l) => l.slug === slug)
      ? sampleComments.map((c): Comment & { sample: boolean } => ({
          ...c,
          launchSlug: slug,
          sample: true,
        }))
      : []),
  ];
}

export function displayedReviews(slug: string, local: Review[]) {
  return [
    ...local
      .filter((r) => r.businessSlug === slug)
      .map((r) => ({ ...r, id: "mine", sample: false })),
    ...(businesses.some((b) => b.slug === slug)
      ? sampleReviews.map((r) => ({ ...r, sample: true }))
      : []),
  ];
}

export function reviewAverage(reviews: { overall: number }[]) {
  return reviews.length ? reviews.reduce((sum, r) => sum + r.overall, 0) / reviews.length : null;
}
