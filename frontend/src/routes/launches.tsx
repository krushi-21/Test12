import { createFileRoute, Link } from "@tanstack/react-router";
import { useDemo, useStore } from "@/lib/store";
import { PageHeading, LaunchCard } from "@/components/site";
import { DetailTabs, SearchField, EmptyState } from "@/components/discovery-ui";
import { inputCls } from "@/components/bits";
import { categories, cities, type Stage } from "@/lib/demo";
import { isLaunching } from "@/lib/discovery";
import { seo } from "@/lib/seo";
const stages: Stage[] = ["Coming Soon", "Launching Today", "Live", "Trending", "Established"];
export const Route = createFileRoute("/launches")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    stage?: Stage | undefined;
    q?: string;
    city?: string;
    category?: string;
    view?: string;
  } => ({
    ...(stages.includes(s["stage"] as Stage) ? { stage: s["stage"] as Stage } : {}),
    ...(typeof s["q"] === "string" ? { q: s["q"] } : {}),
    ...(typeof s["city"] === "string" ? { city: s["city"] } : {}),
    ...(typeof s["category"] === "string" ? { category: s["category"] } : {}),
    ...(typeof s["view"] === "string" ? { view: s["view"] } : {}),
  }),
  head: () => seo("Launches", "Discover upcoming, live and new launches from India’s founders."),
  component: Launches,
});
function Launches() {
  const { launches, getBusiness } = useDemo();
  const { likes } = useStore();
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const { q = "", stage, city = "", category = "", view = "Newest" } = s;
  const update = (v: Partial<typeof s>) =>
    void navigate({ search: (p) => ({ ...p, ...v }), replace: true });
  const list = launches
    .filter((l) => {
      const b = getBusiness(l.businessSlug);
      return (
        b &&
        `${l.title} ${l.summary} ${b.name}`.toLowerCase().includes(q.toLowerCase()) &&
        (!stage || l.stage === stage) &&
        (!city || b.city === city) &&
        (!category || b.category === category) &&
        (view !== "Launching Now" || isLaunching(l)) &&
        (view !== "Upcoming" || l.stage === "Coming Soon")
      );
    })
    .sort((a, b) =>
      view === "Most Popular"
        ? Number(likes.includes(b.slug)) - Number(likes.includes(a.slug)) ||
          b.startsAt.localeCompare(a.startsAt)
        : b.startsAt.localeCompare(a.startsAt),
    );
  return (
    <>
      <PageHeading eyebrow="Launch directory" title="Launches">
        New ideas, independent makers, and their next big moment.
      </PageHeading>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <DetailTabs
            items={["Launching Now", "Upcoming", "Newest", "Most Popular"]}
            value={view}
            onChange={(view) => update({ view })}
          />
          {view === "Most Popular" && (
            <p className="mb-4 text-xs text-muted-foreground">
              Sorted by likes created in this browser, then newest. No platform-wide popularity
              data.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((l) => (
              <LaunchCard key={l.slug} launch={l} />
            ))}
          </div>
          {!list.length && (
            <EmptyState
              title="No launches match these filters"
              action={
                <Link to="/launches" search={{}} className="text-primary">
                  Clear filters
                </Link>
              }
            />
          )}
          <Link to="/upcoming" className="mt-6 inline-block text-xs text-primary">
            Launch calendar & reminders →
          </Link>
        </div>
        <aside className="h-fit space-y-5 rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold">Filters</h2>
          <SearchField
            label="Search launches"
            value={q}
            onChange={(q) => update({ q })}
            placeholder="Search launches…"
          />
          <label className="block space-y-2 text-xs">
            Category
            <select
              value={category}
              onChange={(e) => update({ category: e.target.value })}
              className={inputCls}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-xs">
            Location
            <select
              value={city}
              onChange={(e) => update({ city: e.target.value })}
              className={inputCls}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-xs">
            Launch status
            <select
              aria-label="Launch status"
              value={stage ?? ""}
              onChange={(e) =>
                update(e.target.value ? { stage: e.target.value as Stage } : { stage: undefined })
              }
              className={inputCls}
            >
              <option value="">All statuses</option>
              {stages.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Link to="/launches" search={{}} className="inline-block text-xs text-primary">
            Clear filters
          </Link>
        </aside>
      </div>
    </>
  );
}
