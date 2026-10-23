import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LaunchCard, PageHeading } from "@/components/site";
import { SignedIn } from "@/components/bits";
import { categories, cities } from "@/lib/demo";
import { useStore, useDemo } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/feed")({
  head: () => seo("Community", "Your For You and Following feeds of new launches across India."),
  component: Feed,
});

function Feed() {
  const { businesses, launches, getBusiness } = useDemo();
  const reasonFor = (slug: string, follows: string[]) => {
    const l = launches.find((l) => l.slug === slug);
    const b = l ? getBusiness(l.businessSlug) : undefined;
    if (!b) return "Recent launch";
    if (follows.includes(`business:${b.slug}`)) return `You follow ${b.name}`;
    if (follows.includes(`founder:${b.founderSlug}`)) return "From a founder you follow";
    if (follows.includes(`category:${b.category}`)) return `Popular in ${b.category}`;
    return `Popular in ${b.city}`;
  };
  const { follows } = useStore();
  const [tab, setTab] = useState<"for-you" | "following">("for-you");
  const [city, setCity] = useState("");
  const [cat, setCat] = useState("");

  const forYou = launches
    .filter((l) => {
      const b = getBusiness(l.businessSlug);
      return !!b && (!city || b.city === city) && (!cat || b.category === cat);
    })
    .sort(
      (a, b) =>
        (reasonFor(b.slug, follows).startsWith("Popular") ? 0 : 1) -
          (reasonFor(a.slug, follows).startsWith("Popular") ? 0 : 1) || b.likes - a.likes,
    );
  const following = launches.filter((l) => {
    const b = getBusiness(l.businessSlug);
    if (!b) return false;
    return (
      follows.includes(`business:${b.slug}`) ||
      follows.includes(`founder:${b.founderSlug}`) ||
      follows.includes(`category:${b.category}`)
    );
  });
  const coldStart = follows.length === 0;

  return (
    <>
      <PageHeading eyebrow="Community" title="What's launching for you" />
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full bg-card p-1">
            {(["for-you", "following"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-5 py-2 text-sm font-medium ${tab === t ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                {t === "for-you" ? "For You" : "Following"}
              </button>
            ))}
          </div>
          {tab === "for-you" && (
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
              <select
                aria-label="Feed city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                aria-label="Feed category"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {tab === "for-you" ? (
          <>
            {coldStart && (
              <p className="mt-6 rounded-xl bg-secondary px-4 py-3 text-sm">
                Showing popular recent launches. Follow founders, businesses or categories to
                personalise this feed.
              </p>
            )}
            {forYou.length === 0 && (
              <p role="status" className="mt-6">
                No launches match this city and category.
              </p>
            )}
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {forYou.map((l) => (
                <div key={l.slug}>
                  <p className="mb-2 text-xs font-medium text-accent">
                    ✦ {reasonFor(l.slug, follows)}
                  </p>
                  <LaunchCard launch={l} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-8">
            <SignedIn what="see your Following feed">
              {following.length ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {following.map((l) => (
                    <LaunchCard key={l.slug} launch={l} />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  You aren't following anyone yet.{" "}
                  <Link to="/founders" className="text-primary">
                    Find founders
                  </Link>
                </p>
              )}
              <div className="mt-10">
                <h2 className="font-display text-xl font-semibold">Categories you follow</h2>
                <FollowCategories />
              </div>
            </SignedIn>
          </div>
        )}
        <p className="mt-10 text-xs text-muted-foreground">
          {businesses.length} businesses in this preview.
        </p>
      </div>
    </>
  );
}

function FollowCategories() {
  const { follows, toggle, user } = useStore();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {categories.map((c) => {
        const on = follows.includes(`category:${c}`);
        return (
          <button
            key={c}
            onClick={() => {
              if (user?.verified) toggle("follows", `category:${c}`);
            }}
            className={`rounded-full px-4 py-2 text-sm ${on ? "bg-accent text-accent-foreground" : "border border-border bg-card"}`}
          >
            {on ? "✓ " : "+ "}
            {c}
          </button>
        );
      })}
    </div>
  );
}
