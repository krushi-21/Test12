import { createFileRoute, Link } from "@tanstack/react-router";
import { LaunchCard, PageHeading, Avatar } from "@/components/site";

import { useStore, useDemo } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { sharePage } from "@/lib/share";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/c/$id")({
  head: () => seo("Shared collection", "A public collection of launches on Naviraa."),
  component: SharedCollection,
});

function SharedCollection() {
  const { launches, getBusiness } = useDemo();
  const { id } = Route.useParams();
  const { collections, savedCollections, toggle, user } = useStore();
  const c = collections.find((x) => x.id === id);
  if (!c)
    return (
      <>
        <PageHeading eyebrow="Collection" title="Collection unavailable">
          This preview link only works in the browser where it was created, or the collection was
          removed.
        </PageHeading>
        <div className="mx-auto max-w-6xl px-4">
          <Link to="/launches" className="text-primary">
            Explore launches
          </Link>
        </div>
      </>
    );
  if (!c.isPublic)
    return (
      <>
        <PageHeading eyebrow="Collection" title="This collection is private">
          Its preview link is disabled.
        </PageHeading>
        <div className="mx-auto max-w-6xl px-4">
          <Link to="/collections" className="text-primary">
            Your collections
          </Link>
        </div>
      </>
    );
  const visible = launches.filter((l) => c.launchSlugs.includes(l.slug));
  return (
    <>
      <PageHeading eyebrow="Local guide" title={c.name}>
        Preview link — only available in this browser. {visible.length} launches.
      </PageHeading>
      <div className="mb-5 flex flex-wrap gap-3">
        {user?.verified && (
          <Button
            variant="outline"
            aria-pressed={savedCollections.includes(c.id)}
            onClick={() => toggle("savedCollections", c.id)}
          >
            {savedCollections.includes(c.id) ? "Collection saved" : "Save collection"}
          </Button>
        )}
        <Button variant="outline" onClick={() => void sharePage(`/c/${c.id}`, c.name, false, true)}>
          Copy browser-only preview link
        </Button>
        <Link to="/collections" className="py-2 text-sm text-primary">
          Manage your collections
        </Link>
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((l) => (
          <LaunchCard key={l.slug} launch={l} />
        ))}
      </div>
      {visible.length === 0 && (
        <p role="status" className="mx-auto mt-6 max-w-6xl px-4 text-muted-foreground">
          {c.launchSlugs.length
            ? "The launches in this collection are unavailable."
            : "This collection is empty."}{" "}
          <Link to="/launches" className="text-primary">
            Explore launches
          </Link>
        </p>
      )}
    </>
  );
}
