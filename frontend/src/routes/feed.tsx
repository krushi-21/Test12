import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/site";
import { PostCard } from "@/components/post-card";
import { EmptyState } from "@/components/discovery-ui";
import { SignedIn, inputCls } from "@/components/bits";
import { categories, cities } from "@/lib/demo";
import { useStore, useDemo } from "@/lib/store";
import { seo } from "@/lib/seo";
import { feedModes, filterFeed, type FeedMode } from "@/lib/discovery";
export const Route = createFileRoute("/feed")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { tab?: FeedMode; city?: string; category?: string } => ({
    ...(feedModes.includes(s["tab"] as FeedMode) ? { tab: s["tab"] as FeedMode } : {}),
    ...(typeof s["city"] === "string" && cities.includes(s["city"]) ? { city: s["city"] } : {}),
    ...(typeof s["category"] === "string" && categories.includes(s["category"])
      ? { category: s["category"] }
      : {}),
  }),
  head: () =>
    seo("Discover", "Live launch stories from Naviraa businesses and founders across India."),
  component: Feed,
});
const labels: Record<FeedMode, string> = {
  "for-you": "For You",
  following: "Following",
  launching: "Launching Now",
  trending: "Trending",
  nearby: "Nearby",
};
function Feed() {
  const { businesses, launches } = useDemo();
  const { follows, user, toggle } = useStore();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { tab = "for-you", city = "", category = "" } = search;
  const update = (v: Partial<typeof search>) =>
    void navigate({ search: (p) => ({ ...p, ...v }), replace: true });
  const list = filterFeed(launches, businesses, follows, tab, city, category).sort((a, b) =>
    b.startsAt.localeCompare(a.startsAt),
  );
  const content = (
    <>
      <div data-testid="social-feed" className="mt-5 flex flex-col gap-6">
        {list.map((l) => (
          <PostCard key={l.slug} launch={l} />
        ))}
      </div>
      {!list.length && (
        <EmptyState
          title={
            tab === "nearby" && !city
              ? "Choose a city to explore nearby"
              : "No matching launch stories"
          }
          action={
            <Button variant="outline" onClick={() => void navigate({ search: {} })}>
              Clear filters
            </Button>
          }
        >
          {tab === "following"
            ? "Follow businesses, founders or categories to see their stories here."
            : "Try another city or category."}
        </EmptyState>
      )}
      {tab === "following" && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Categories you follow</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Button
                key={c}
                variant="outline"
                disabled={!user?.verified}
                aria-pressed={follows.includes(`category:${c}`)}
                onClick={() => toggle("follows", `category:${c}`)}
                className={`text-xs ${follows.includes(`category:${c}`) ? "bg-secondary text-primary" : ""}`}
              >
                {c}
              </Button>
            ))}
          </div>
          {user && !user.verified && (
            <Link to="/verify-email" className="mt-3 inline-block text-xs text-primary">
              Verify email to follow categories
            </Link>
          )}
        </section>
      )}
    </>
  );
  return (
    <>
      <PageHeading eyebrow="Community" title="Discover">
        Launch stories from businesses and founders. Follow, connect and be part of the journey.
      </PageHeading>
      <div className="flex flex-wrap gap-2">
        {feedModes.map((t) => (
          <Button
            key={t}
            variant="ghost"
            aria-pressed={tab === t}
            onClick={() => update({ tab: t })}
            className={`rounded-full px-4 text-xs ${tab === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {labels[t]}
          </Button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          aria-label="Feed city"
          value={city}
          onChange={(e) => update({ city: e.target.value })}
          className={inputCls}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Feed category"
          value={category}
          onChange={(e) => update({ category: e.target.value })}
          className={inputCls}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {tab === "following" ? (
        <SignedIn what="see your Following feed">{content}</SignedIn>
      ) : (
        content
      )}
    </>
  );
}
