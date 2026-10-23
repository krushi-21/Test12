import { useDemo } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, BusinessCard, LaunchCard, Mark } from "@/components/site";
import { categories } from "@/lib/demo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Naviraa — Discover what India is building" },
      {
        name: "description",
        content:
          "Launches, small businesses and the founders behind them, from every corner of India.",
      },
      { property: "og:title", content: "Naviraa — Discover what India is building" },
      {
        property: "og:description",
        content:
          "Launches, small businesses and the founders behind them, from every corner of India.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { businesses, founders, launches } = useDemo();
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.3fr_1fr] md:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            India-wide launch community
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] md:text-7xl">
            Discover what <em className="text-primary">India</em> is building.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Follow new products, services and small businesses as they launch — and meet the
            founders behind them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/launches"
              className="rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
            >
              Browse launches
            </Link>
            <Link
              to="/businesses"
              className="rounded-full border border-foreground px-6 py-3 font-medium hover:bg-foreground hover:text-background"
            >
              Find businesses
            </Link>
          </div>
        </div>
        <div className="relative mx-auto aspect-[3/4] w-full max-w-sm rounded-t-full bg-secondary p-6">
          <div className="flex h-full flex-col items-center justify-end rounded-t-full bg-primary p-8 text-primary-foreground">
            <Mark className="h-24 w-24" />
            <p className="mt-4 font-display text-3xl">{launches.length} launches</p>
            <p className="text-sm opacity-80">
              in this preview across {new Set(businesses.map((b) => b.city)).size} cities
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl font-semibold">Launching now</h2>
          <Link to="/launches" className="text-sm font-medium text-primary">
            See all →
          </Link>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {launches.slice(0, 3).map((l) => (
            <LaunchCard key={l.slug} launch={l} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl font-semibold">Popular categories</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {categories.map((c) => (
            <Link
              key={c}
              to="/businesses"
              search={{ category: c }}
              className="rounded-full border border-border bg-card px-5 py-2.5 text-sm hover:border-primary hover:text-primary"
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl gap-10 px-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="font-display text-3xl font-semibold">New businesses</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[...businesses]
              .sort((a, b) => a.launchedDaysAgo - b.launchedDaysAgo)
              .slice(0, 4)
              .map((b) => (
                <BusinessCard key={b.slug} business={b} />
              ))}
          </div>
        </div>
        <div>
          <h2 className="font-display text-3xl font-semibold">Founders</h2>
          <ul className="mt-6 space-y-3">
            {founders.slice(0, 5).map((f) => (
              <li key={f.slug} className="flex items-center gap-3 rounded-xl bg-card p-3">
                <Avatar
                  initials={f.initials}
                  photo={f.photo}
                  className="h-11 w-11 rounded-full bg-accent text-sm text-accent-foreground"
                />
                <div>
                  <p className="font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.city} · {f.interests[0]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
