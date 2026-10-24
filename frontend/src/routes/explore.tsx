import { createFileRoute, Link } from "@tanstack/react-router";
import { categories, cities } from "@/lib/demo";
import { useDemo, useStore } from "@/lib/store";
import { BusinessCard, Avatar, PageHeading } from "@/components/site";
import { SearchField, EmptyState, DetailTabs } from "@/components/discovery-ui";
import { FollowButton } from "@/components/reviews";
import { seo } from "@/lib/seo";
import { inputCls } from "@/components/bits";
export const Route = createFileRoute("/explore")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { q?: string; type?: string; city?: string; category?: string; sort?: string } => ({
    ...(typeof s["q"] === "string" ? { q: s["q"] } : {}),
    ...(typeof s["type"] === "string" ? { type: s["type"] } : {}),
    ...(typeof s["city"] === "string" ? { city: s["city"] } : {}),
    ...(typeof s["category"] === "string" ? { category: s["category"] } : {}),
    ...(typeof s["sort"] === "string" ? { sort: s["sort"] } : {}),
  }),
  head: () =>
    seo(
      "Explore",
      "Discover Naviraa businesses, founders, categories and browser-preview collections.",
    ),
  component: Explore,
});
function Explore() {
  const { businesses, founders, launches, getBusiness } = useDemo();
  const { collections } = useStore();
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const { q = "", type = "All", city = "", category = "", sort = "relevant" } = s;
  const update = (v: Partial<typeof s>) =>
    void navigate({ search: (p) => ({ ...p, ...v }), replace: true });
  const match = (text: string) => text.toLowerCase().includes(q.toLowerCase());
  let bs = businesses.filter(
    (b) =>
      match(`${b.name} ${b.tagline} ${b.category}`) &&
      (!city || city === b.city) &&
      (!category || category === b.category),
  );
  if (sort === "name") bs = bs.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "new") bs = bs.sort((a, b) => a.launchedDaysAgo - b.launchedDaysAgo);
  const fs = founders.filter(
    (f) =>
      match(`${f.name} ${f.bio} ${f.interests.join(" ")}`) &&
      (!city || f.city === city) &&
      (!category || businesses.some((b) => b.founderSlug === f.slug && b.category === category)),
  );
  const cs = collections.filter(
    (c) =>
      c.isPublic &&
      match(c.name) &&
      (!city ||
        c.launchSlugs.some(
          (sl) =>
            getBusiness(launches.find((l) => l.slug === sl)?.businessSlug ?? "")?.city === city,
        )) &&
      (!category ||
        c.launchSlugs.some(
          (sl) =>
            getBusiness(launches.find((l) => l.slug === sl)?.businessSlug ?? "")?.category ===
            category,
        )),
  );
  return (
    <>
      <PageHeading eyebrow="Discovery" title="Explore">
        Discover businesses, founders and collections from across India.
      </PageHeading>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <SearchField label="Search Explore" value={q} onChange={(q) => update({ q })} />
          <div className="my-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c}
                to="/explore"
                search={{ ...s, category: category === c ? "" : c }}
                className={`rounded-lg px-3 py-2 text-xs ${category === c ? "bg-secondary text-primary" : "bg-card text-muted-foreground"}`}
              >
                {c}
              </Link>
            ))}
          </div>
          <DetailTabs
            items={["All", "Businesses", "Founders", "Categories", "Collections"]}
            value={type}
            onChange={(type) => update({ type })}
          />
          {["All", "Businesses"].includes(type) && (
            <>
              <h2 className="mb-3 text-sm font-semibold">Businesses</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {bs.map((b) => (
                  <BusinessCard key={b.slug} business={b} />
                ))}
              </div>
              {!bs.length && (
                <EmptyState
                  title="No matching businesses"
                  action={
                    <Link to="/explore" search={{}} className="text-primary">
                      Clear filters
                    </Link>
                  }
                />
              )}
            </>
          )}
          {["All", "Founders"].includes(type) && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold">Founders</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {fs.map((f) => (
                  <div key={f.slug} className="rounded-lg bg-card p-4">
                    <Link
                      to="/founders/$slug"
                      params={{ slug: f.slug }}
                      className="flex items-center gap-3"
                    >
                      <Avatar
                        photo={f.photo}
                        initials={f.initials}
                        className="h-12 w-12 rounded-full bg-muted"
                      />
                      <div>
                        <p className="font-semibold">{f.name}</p>
                        <p className="text-xs text-muted-foreground">{f.city}</p>
                      </div>
                    </Link>
                    <p className="my-3 text-xs text-muted-foreground">{f.bio}</p>
                    <FollowButton id={`founder:${f.slug}`} />
                  </div>
                ))}
              </div>
              {!fs.length && <EmptyState title="No matching founders" />}
            </section>
          )}
          {type === "Categories" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.filter(match).map((c) => (
                <Link
                  key={c}
                  to="/businesses"
                  search={{ category: c }}
                  className="rounded-lg bg-card p-5"
                >
                  <h2 className="font-semibold">{c}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {
                      businesses.filter((b) => b.category === c && (!city || b.city === city))
                        .length
                    }{" "}
                    preview businesses
                  </p>
                </Link>
              ))}
            </div>
          )}
          {["All", "Collections"].includes(type) && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold">Collections · This browser only</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {cs.map((c) => (
                  <Link
                    key={c.id}
                    to="/c/$id"
                    params={{ id: c.id }}
                    className="rounded-lg bg-card p-5"
                  >
                    <h3 className="font-semibold">{c.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.launchSlugs.length} launches · Browser-only preview
                    </p>
                  </Link>
                ))}
              </div>
              {!cs.length && (
                <EmptyState
                  title="No matching preview collections"
                  action={
                    <Link to="/collections" className="text-primary">
                      Create a collection
                    </Link>
                  }
                />
              )}
            </section>
          )}
        </div>
        <aside className="space-y-4 rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold">Filters</h2>
          <label className="block space-y-2 text-xs">
            Location
            <select
              className={inputCls}
              value={city}
              onChange={(e) => update({ city: e.target.value })}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-xs">
            Category
            <select
              className={inputCls}
              value={category}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-xs">
            Sort businesses
            <select
              className={inputCls}
              value={sort}
              onChange={(e) => update({ sort: e.target.value })}
            >
              <option value="relevant">Most relevant</option>
              <option value="name">Name</option>
              <option value="new">Newest</option>
            </select>
          </label>
          <Link to="/explore" search={{}} className="inline-block text-xs text-primary">
            Clear filters
          </Link>
        </aside>
      </div>
    </>
  );
}
