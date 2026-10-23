import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, BusinessCard, LaunchCard } from "@/components/site";
import { getFounder } from "@/lib/demo";
import { useStore, useDemo } from "@/lib/store";

export const Route = createFileRoute("/founders_/$slug")({
  loader: ({ params }) => {
    const founder = getFounder(params.slug);
    return { founder };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.founder
      ? `${loaderData.founder.name} — Naviraa`
      : "Founder unavailable — Naviraa";
    const d = loaderData?.founder?.bio ?? "This founder could not be found.";
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: FounderPage,
});

function FounderPage() {
  const { slug } = Route.useParams();
  const { getFounder, businesses, launches } = useDemo();
  const f = getFounder(slug);
  const { follows, toggle, user } = useStore();
  if (!f)
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="font-display text-3xl">Founder unavailable</h1>
        <Link to="/founders" className="text-primary">
          Browse founders
        </Link>
      </div>
    );
  const owned = businesses.filter(
    (b) => b.founderSlug === f.slug && (!f.publicBrands || f.publicBrands.includes(b.slug)),
  );
  const theirs = launches.filter((l) => owned.some((b) => b.slug === l.businessSlug));
  const on = follows.includes(`founder:${f.slug}`);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-center gap-6">
        <Avatar
          initials={f.initials}
          photo={f.photo}
          className="h-28 w-24 rounded-t-full bg-primary pb-4 font-display text-3xl text-primary-foreground"
        />
        <div className="flex-1">
          <h1 className="font-display text-4xl font-semibold md:text-5xl">{f.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {f.pronouns ? `${f.pronouns} · ` : ""}
            {f.city}
          </p>
          <p className="mt-3 max-w-xl">{f.bio}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {f.interests.map((i) => (
              <span key={i} className="rounded-full bg-secondary px-3 py-1 text-xs">
                {i}
              </span>
            ))}
          </div>
        </div>
        {user && (
          <button
            onClick={() => {
              if (!user?.verified) return;
              toggle("follows", `founder:${f.slug}`);
            }}
            className={`rounded-full px-6 py-2.5 text-sm font-medium ${on ? "bg-accent text-accent-foreground" : "border border-foreground"}`}
          >
            {on ? "Following" : "Follow"}
          </button>
        )}
      </div>
      <h2 className="mt-12 font-display text-2xl font-semibold">Businesses</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {owned.map((b) => (
          <BusinessCard key={b.slug} business={b} />
        ))}
      </div>
      {theirs.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-2xl font-semibold">Launches</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {theirs.map((l) => (
              <LaunchCard key={l.slug} launch={l} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
