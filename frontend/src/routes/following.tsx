import { createFileRoute, Link } from "@tanstack/react-router";
import { useDemo, useStore } from "@/lib/store";
import { PageHeading, BusinessCard, Avatar } from "@/components/site";
import { SignedIn } from "@/components/bits";
import { FollowButton } from "@/components/reviews";
import { EmptyState } from "@/components/discovery-ui";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/following")({
  head: () => seo("Following", "Businesses, founders and categories you follow in Naviraa.", true),
  component: Following,
});
function Following() {
  const { businesses, founders } = useDemo();
  const { follows } = useStore();
  const bs = businesses.filter((b) => follows.includes(`business:${b.slug}`));
  const fs = founders.filter((f) => follows.includes(`founder:${f.slug}`));
  return (
    <>
      <PageHeading eyebrow="Community" title="Following">
        Your people, their businesses, and what comes next. Saved in this browser.
      </PageHeading>
      <SignedIn what="see who you follow">
        <section>
          <h2 className="mb-4 text-base font-semibold">Businesses</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {bs.map((b) => (
              <div key={b.slug}>
                <BusinessCard business={b} />
                <div className="mt-2">
                  <FollowButton id={`business:${b.slug}`} />
                </div>
              </div>
            ))}
          </div>
          {!bs.length && (
            <EmptyState
              title="Find your next favourite business"
              action={
                <Link to="/explore" className="text-primary">
                  Explore businesses
                </Link>
              }
            />
          )}
        </section>
        <section className="mt-8">
          <h2 className="mb-4 text-base font-semibold">Founders</h2>
          {fs.map((f) => (
            <div
              key={f.slug}
              className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-card p-4"
            >
              <Link
                to="/founders/$slug"
                params={{ slug: f.slug }}
                className="flex min-w-0 items-center gap-3"
              >
                <Avatar
                  photo={f.photo}
                  initials={f.initials}
                  className="h-10 w-10 rounded-full bg-muted"
                />
                <div>
                  <p className="text-sm font-semibold">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.city}</p>
                </div>
              </Link>
              <FollowButton id={`founder:${f.slug}`} />
            </div>
          ))}
          {!fs.length && (
            <EmptyState
              title="No founders followed yet"
              action={
                <Link to="/founders" className="text-primary">
                  Meet founders
                </Link>
              }
            />
          )}
        </section>
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold">Categories</h2>
          <div className="flex flex-wrap gap-2">
            {follows
              .filter((f) => f.startsWith("category:"))
              .map((f) => (
                <Link
                  key={f}
                  to="/feed"
                  search={{ category: f.slice(9) }}
                  className="rounded-lg bg-secondary px-3 py-2 text-xs"
                >
                  {f.slice(9)}
                </Link>
              ))}
          </div>
          <Link
            to="/feed"
            search={{ tab: "following" }}
            className="mt-5 inline-block text-sm text-primary"
          >
            Open Following feed →
          </Link>
        </section>
      </SignedIn>
    </>
  );
}
