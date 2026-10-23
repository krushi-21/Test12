import { createFileRoute } from "@tanstack/react-router";
import { BusinessCard, LaunchCard, PageHeading } from "@/components/site";
import { SignedIn } from "@/components/bits";
import { useDemo, useStore } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/saved")({
  head: () => seo("Saved items", "Your saved Naviraa businesses and launches.", true),
  component: Saved,
});

function Saved() {
  const { saves } = useStore();
  const { businesses, launches } = useDemo();
  const savedBusinesses = businesses.filter((b) => saves.includes(`business:${b.slug}`));
  const savedLaunches = launches.filter((l) => saves.includes(l.slug));
  return (
    <>
      <PageHeading eyebrow="Your lists" title="Saved items" />
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
              <p className="mt-4 text-muted-foreground">No saved businesses yet.</p>
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
              <p className="mt-4 text-muted-foreground">No saved launches yet.</p>
            )}
          </section>
        </SignedIn>
      </div>
    </>
  );
}
