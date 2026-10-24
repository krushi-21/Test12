import { createFileRoute, Link } from "@tanstack/react-router";
import { BusinessCard, LaunchCard, PageHeading } from "@/components/site";
import { SignedIn } from "@/components/bits";
import { useDemo, useStore } from "@/lib/store";
import { PostCard } from "@/components/post-card";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/saved")({
  head: () => seo("Saved items", "Your saved Naviraa businesses and launches.", true),
  component: Saved,
});

function Saved() {
  const { saves, savedPosts, savedCollections, collections } = useStore();
  const { businesses, launches } = useDemo();
  const savedBusinesses = businesses.filter((b) => saves.includes(`business:${b.slug}`));
  const savedLaunches = launches.filter((l) => saves.includes(l.slug));
  return (
    <>
      <PageHeading eyebrow="Your lists" title="Saved">
        Businesses, launch posts and collections are saved separately in this browser.
      </PageHeading>
      <div className="mx-auto max-w-6xl space-y-8 px-4">
        <SignedIn what="see saved items" needVerified>
          <section>
            <h2 className="font-display text-2xl">Businesses</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedBusinesses.map((b) => (
                <BusinessCard key={b.slug} business={b} />
              ))}
            </div>
            {!savedBusinesses.length && (
              <p className="mt-4 text-muted-foreground">
                No saved businesses yet.{" "}
                <Link to="/businesses" className="text-primary">
                  Browse businesses
                </Link>
              </p>
            )}
          </section>
          <section className="mt-8">
            <h2 className="font-display text-2xl">Launches</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedLaunches.map((l) => (
                <LaunchCard key={l.slug} launch={l} />
              ))}
            </div>
            {!savedLaunches.length && (
              <p className="mt-4 text-muted-foreground">
                No saved launches yet.{" "}
                <Link to="/launches" className="text-primary">
                  Explore launches
                </Link>
              </p>
            )}
          </section>
          <section className="mt-8">
            <h2 className="mb-4 text-base font-semibold">Posts</h2>
            <div className="flex flex-col gap-6">
              {launches
                .filter((l) => savedPosts.includes(l.slug))
                .map((l) => (
                  <PostCard key={l.slug} launch={l} />
                ))}
            </div>
            {!savedPosts.length && (
              <p className="text-sm text-muted-foreground">
                No saved posts.{" "}
                <Link to="/feed" className="text-primary">
                  Discover stories
                </Link>
              </p>
            )}
          </section>
          <section className="mt-8">
            <h2 className="mb-4 text-base font-semibold">Collections</h2>
            {collections
              .filter((c) => savedCollections.includes(c.id))
              .map((c) => (
                <Link
                  key={c.id}
                  to="/c/$id"
                  params={{ id: c.id }}
                  className="mb-3 block rounded-lg bg-card p-4 text-sm"
                >
                  {c.name} · {c.launchSlugs.length} launches · Browser only
                </Link>
              ))}
            {!savedCollections.length && (
              <p className="text-sm text-muted-foreground">
                No saved collections.{" "}
                <Link to="/collections" className="text-primary">
                  Your collections
                </Link>
              </p>
            )}
          </section>
        </SignedIn>
      </div>
    </>
  );
}
