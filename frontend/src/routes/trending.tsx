import { useDemo } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeading } from "@/components/site";

export const Route = createFileRoute("/trending")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Trending businesses — Naviraa" },
      {
        name: "description",
        content: "Trending today, this week and this month, plus rising businesses across India.",
      },
      { property: "og:title", content: "Trending businesses — Naviraa" },
      {
        property: "og:description",
        content: "Trending today, this week and this month across India.",
      },
    ],
  }),
  component: Trending,
});

const windows = { Today: 1, "This week": 7, "This month": 30 } as const;
type W = keyof typeof windows;

function Trending() {
  const { businesses } = useDemo();
  const [w, setW] = useState<W>("This week");
  const days = windows[w];
  const ranked = [...businesses]
    .map((b) => ({
      b,
      score: Math.round((b.likes + b.saves * 2) / (Math.max(b.launchedDaysAgo, 0) / days + 1)),
    }))
    .sort((a, b) => b.score - a.score);
  return (
    <>
      <PageHeading eyebrow="Leaderboard" title="Trending on Naviraa">
        Rankings are based on likes and saves and are still being tuned.
      </PageHeading>
      <div className="mx-auto max-w-3xl px-4">
        <div className="inline-flex rounded-full bg-card p-1">
          {(Object.keys(windows) as W[]).map((k) => (
            <button
              key={k}
              onClick={() => setW(k)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${w === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <ol className="mt-8 space-y-3">
          {ranked.map(({ b, score }, i) => (
            <li key={b.slug}>
              <Link
                to="/businesses/$slug"
                params={{ slug: b.slug }}
                className="flex items-center gap-5 rounded-2xl border border-border bg-card p-4 hover:border-primary"
              >
                <span
                  className={`font-display text-3xl font-semibold ${i < 3 ? "text-primary" : "text-muted-foreground"}`}
                >
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.category} · {b.city}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {score.toLocaleString("en-IN")} pts
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
