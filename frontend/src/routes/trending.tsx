import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDemo } from "@/lib/store";
import { PageHeading, Avatar } from "@/components/site";
import { DetailTabs, EmptyState } from "@/components/discovery-ui";
import { FollowButton } from "@/components/reviews";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/trending")({
  head: () =>
    seo(
      "Leaderboard",
      "Sample business rankings and honest founder ranking availability on Naviraa.",
    ),
  component: Leaderboard,
});
function Leaderboard() {
  const { businesses } = useDemo();
  const [tab, setTab] = useState("Businesses");
  const [days, setDays] = useState(7);
  const ranked = businesses
    .map((b) => ({
      b,
      score: Math.round((b.likes + b.saves * 2) / (Math.max(b.launchedDaysAgo, 0) / days + 1)),
    }))
    .sort((a, b) => b.score - a.score);
  return (
    <>
      <PageHeading eyebrow="Community" title="Leaderboard">
        A look at the businesses making waves in the preview.
      </PageHeading>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DetailTabs items={["Businesses", "Founders"]} value={tab} onChange={setTab} />
        <select
          aria-label="Leaderboard period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-input bg-card px-3 py-2 text-xs"
        >
          <option value={1}>Today</option>
          <option value={7}>This week</option>
          <option value={30}>This month</option>
        </select>
      </div>
      {tab === "Founders" ? (
        <EmptyState
          title="Founder rankings unavailable"
          action={
            <Link to="/founders" className="text-primary">
              Meet the founders
            </Link>
          }
        >
          No historical or cross-account founder ranking metrics are connected.
        </EmptyState>
      ) : (
        <>
          <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
            Sample scores use fictional fixture likes and saves, weighted by age and selected
            period. These are not measured time-window totals. No growth percentages are available.
          </p>
          <ol className="space-y-3">
            {ranked.map(({ b, score }, i) => (
              <li
                key={b.slug}
                className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-card p-4"
              >
                <span className="text-base font-semibold text-primary">{i + 1}</span>
                <Link
                  to="/businesses/$slug"
                  params={{ slug: b.slug }}
                  className="flex min-w-0 items-center gap-3"
                >
                  <Avatar
                    photo={b.cover}
                    initials={b.name.slice(0, 2)}
                    className="hidden h-12 w-12 rounded-lg bg-muted sm:flex"
                  />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{b.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.category} · {b.city}
                    </p>
                    <p className="mt-1 text-[10px] text-accent">
                      {score.toLocaleString("en-IN")} sample points
                    </p>
                  </div>
                </Link>
                <FollowButton id={`business:${b.slug}`} />
              </li>
            ))}
          </ol>
          {!ranked.length && <EmptyState title="No businesses to rank yet" />}
        </>
      )}
    </>
  );
}
