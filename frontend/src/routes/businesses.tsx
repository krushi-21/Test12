import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BusinessCard, PageHeading } from "@/components/site";
import { categories, cities, type Mode } from "@/lib/demo";

export const Route = createFileRoute("/businesses")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    category?: string | undefined;
    q?: string | undefined;
    city?: string | undefined;
    mode?: string | undefined;
    price?: string | undefined;
    sort?: string | undefined;
    open?: boolean | undefined;
    verified?: boolean | undefined;
    recent?: boolean | undefined;
  } => ({
    category:
      typeof s["category"] === "string" && categories.includes(s["category"])
        ? s["category"]
        : undefined,
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    city: typeof s["city"] === "string" && cities.includes(s["city"]) ? s["city"] : undefined,
    mode: ["online", "physical", "hybrid"].includes(String(s["mode"]))
      ? String(s["mode"])
      : undefined,
    price: ["₹", "₹₹", "₹₹₹"].includes(String(s["price"])) ? String(s["price"]) : undefined,
    sort: ["new", "trending", "most-liked", "most-saved"].includes(String(s["sort"]))
      ? String(s["sort"])
      : undefined,
    open: s["open"] === true || s["open"] === "true" ? true : undefined,
    verified: s["verified"] === true || s["verified"] === "true" ? true : undefined,
    recent: s["recent"] === true || s["recent"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Discover businesses — Naviraa" },
      {
        name: "description",
        content: "Find small businesses across India by city, category, mode, price and more.",
      },
      { property: "og:title", content: "Discover businesses — Naviraa" },
      {
        property: "og:description",
        content: "Find small businesses across India by city, category, mode and price.",
      },
    ],
  }),
  component: Businesses,
});

type Sort = "new" | "trending" | "most-liked" | "most-saved";

const select = "rounded-lg border border-input bg-card px-3 py-2 text-sm";

function Businesses() {
  const { businesses } = useDemo();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    q = "",
    city = "",
    category = "",
    mode = "",
    price = "",
    sort = "trending",
    open: openNow = false,
    verified = false,
    recent: newOnly = false,
  } = search;
  const update = (value: Partial<typeof search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...value }), replace: true });
  };
  const setQ = (q: string) => update({ q });
  const setCity = (city: string) => update({ city });
  const setCategory = (category: string) => update({ category });
  const setMode = (mode: string) => update({ mode });
  const setPrice = (price: string) => update({ price });
  const setSort = (sort: string) => update({ sort });
  const setOpenNow = (open: boolean) => update({ open });
  const setVerified = (verified: boolean) => update({ verified });
  const setNewOnly = (recent: boolean) => update({ recent });

  const list = useMemo(() => {
    const r = businesses.filter(
      (b) =>
        (!q ||
          `${b.name} ${b.tagline} ${b.description} ${b.area} ${b.city} ${b.category}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!city || b.city === city) &&
        (!category || b.category === category) &&
        (!mode || b.mode === mode) &&
        (!price || b.priceRange === price) &&
        (!openNow || b.openNow) &&
        (!verified || b.verified) &&
        (!newOnly || b.launchedDaysAgo <= 14),
    );
    const key: Record<Sort, (b: (typeof businesses)[number]) => number> = {
      new: (b) => -b.launchedDaysAgo,
      trending: (b) => b.likes / (b.launchedDaysAgo + 2),
      "most-liked": (b) => b.likes,
      "most-saved": (b) => b.saves,
    };
    return [...r].sort(
      (a, b) => (key[sort as Sort] ?? key.trending)(b) - (key[sort as Sort] ?? key.trending)(a),
    );
  }, [businesses, q, city, category, mode, price, openNow, verified, newOnly, sort]);

  return (
    <>
      <PageHeading eyebrow="Discover" title="Businesses across India">
        Search by city, area and category. Every contact button goes straight to the business.
      </PageHeading>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit space-y-4 rounded-2xl border border-border bg-card p-5">
          <input
            aria-label="Search businesses"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or area"
            className={`${select} w-full`}
          />
          <select
            aria-label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={`${select} w-full`}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${select} w-full`}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Business mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode | "")}
            className={`${select} w-full`}
          >
            <option value="">Any mode</option>
            <option value="online">Online</option>
            <option value="physical">Physical</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <select
            aria-label="Price range"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`${select} w-full`}
          >
            <option value="">Any price</option>
            <option>₹</option>
            <option>₹₹</option>
            <option>₹₹₹</option>
          </select>
          {(
            [
              ["Open now", openNow, setOpenNow],
              ["Email-verified account", verified, setVerified],
              ["Newly launched", newOnly, setNewOnly],
            ] as const
          ).map(([l, v, set]) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v}
                onChange={(e) => set(e.target.checked)}
                className="accent-primary"
              />
              {l}
            </label>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              void navigate({ search: {} });
            }}
          >
            Clear filters
          </Button>
        </aside>
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{list.length} businesses</p>
            <select
              aria-label="Sort businesses"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className={select}
            >
              <option value="trending">Trending</option>
              <option value="new">Newest</option>
              <option value="most-liked">Most liked</option>
              <option value="most-saved">Most saved</option>
            </select>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((b) => (
              <BusinessCard key={b.slug} business={b} />
            ))}
          </div>
          {list.length === 0 && (
            <p className="rounded-2xl bg-card p-8 text-center text-muted-foreground">
              No businesses match these filters.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
