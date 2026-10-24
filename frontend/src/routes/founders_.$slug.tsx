import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, BusinessCard, LaunchCard } from "@/components/site";
import { getFounder } from "@/lib/demo";
import { useDemo } from "@/lib/store";
import { useState } from "react";
import { DetailTabs, Gallery, EmptyState } from "@/components/discovery-ui";
import { PostCard } from "@/components/post-card";
import { FollowButton } from "@/components/reviews";

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
  const [tab, setTab] = useState("Posts");
  const { getFounder, businesses, launches } = useDemo();
  const f = getFounder(slug);
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
  return (
    <div className="mx-auto max-w-6xl">
      <Gallery
        images={owned[0]?.cover ? [{ url: owned[0].cover, alt: owned[0].name }] : []}
        label={`${f.name} businesses`}
        aspect="aspect-[3/1]"
      />
      <div className="mt-5 flex flex-wrap items-center gap-5">
        <Avatar
          initials={f.initials}
          photo={f.photo}
          className="h-20 w-20 rounded-full bg-primary font-display text-2xl text-primary-foreground"
        />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-semibold">{f.name}</h1>
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
        <FollowButton id={`founder:${f.slug}`} />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_230px]">
        <div>
          <DetailTabs items={["Posts", "About", "Businesses"]} value={tab} onChange={setTab} />
          {tab === "About" && (
            <section>
              <h2 className="text-base font-semibold">About {f.name}</h2>
              <p className="mt-3 text-sm leading-relaxed">{f.bio}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Social links and cross-account follower statistics are not provided in this preview.
              </p>
            </section>
          )}
          {tab === "Businesses" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {owned.map((b) => (
                <BusinessCard key={b.slug} business={b} />
              ))}
              {!owned.length && <EmptyState title="No businesses listed" />}
            </div>
          )}
          {tab === "Posts" && (
            <div className="flex flex-col gap-6">
              {theirs.map((l) => (
                <PostCard key={l.slug} launch={l} />
              ))}
              {!theirs.length && (
                <EmptyState
                  title="No launch posts yet"
                  action={
                    <Link to="/launches" className="text-primary">
                      Explore launches
                    </Link>
                  }
                />
              )}
            </div>
          )}
        </div>
        <aside aria-label="Founder sidebar" className="space-y-4">
          <section className="rounded-lg bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Founded by {f.name.split(" ")[0]}</h2>
            {owned.map((b) => (
              <Link
                key={b.slug}
                to="/businesses/$slug"
                params={{ slug: b.slug }}
                className="mb-3 flex items-center gap-3"
              >
                <Avatar
                  photo={b.cover}
                  initials={b.name.slice(0, 2)}
                  className="h-10 w-10 rounded-lg bg-muted"
                />
                <div>
                  <p className="text-xs font-semibold">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {b.category} · {b.city}
                  </p>
                </div>
              </Link>
            ))}
            {!owned.length && (
              <p className="text-xs text-muted-foreground">No public businesses listed.</p>
            )}
          </section>
          <section className="rounded-lg bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Public profile</h2>
            <p className="text-xs text-muted-foreground">
              {owned.length} listed businesses · {theirs.length} available launch posts
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Sample records; follower and historical metrics are unavailable.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
