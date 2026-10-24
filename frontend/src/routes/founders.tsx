import { Button } from "@/components/ui/button";
import { FollowButton } from "@/components/reviews";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Avatar, PageHeading } from "@/components/site";
import { useDemo } from "@/lib/store";

export const Route = createFileRoute("/founders")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Founders — Naviraa" },
      { name: "description", content: "Meet the people building India's newest small businesses." },
      { property: "og:title", content: "Founders — Naviraa" },
      {
        property: "og:description",
        content: "Meet the people building India's newest small businesses.",
      },
    ],
  }),
  component: Founders,
});

function Founders() {
  const { businesses, founders } = useDemo();
  const [q, setQ] = useState("");
  const list = founders.filter((f) =>
    `${f.name} ${f.city} ${f.interests.join(" ")}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <PageHeading eyebrow="Founders" title="The people behind the launches" />
      <div className="mx-auto max-w-6xl px-4">
        <input
          aria-label="Search founders"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search founders by name, city or interest"
          className="w-full max-w-md rounded-full border border-input bg-card px-5 py-3 text-sm"
        />
        {list.length === 0 && (
          <div role="status" className="mt-6 space-y-3">
            <p className="text-muted-foreground">
              {founders.length ? "No founders match your search." : "No founders listed yet."}
            </p>
            {q ? (
              <Button variant="outline" onClick={() => setQ("")}>
                Clear search
              </Button>
            ) : (
              <Link to="/launches" className="text-primary">
                Explore launches
              </Link>
            )}
          </div>
        )}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((f) => {
            const owned = businesses.filter((b) => b.founderSlug === f.slug);
            return (
              <div key={f.slug} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-4">
                  <Avatar
                    initials={f.initials}
                    photo={f.photo}
                    className="h-14 w-14 rounded-t-full bg-primary font-display text-xl text-primary-foreground"
                  />
                  <div>
                    <Link
                      to="/founders/$slug"
                      params={{ slug: f.slug }}
                      className="font-display text-xl font-semibold hover:text-primary"
                    >
                      {f.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {f.pronouns ? `${f.pronouns} · ` : ""}
                      {f.city}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{f.bio}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {f.interests.map((i) => (
                    <span key={i} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {i}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    {owned.map((b) => (
                      <Link
                        key={b.slug}
                        to="/businesses/$slug"
                        params={{ slug: b.slug }}
                        className="text-primary hover:underline"
                      >
                        {b.name}
                      </Link>
                    ))}
                  </div>
                  <FollowButton id={`founder:${f.slug}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
