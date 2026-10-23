import { createFileRoute } from "@tanstack/react-router";
import { LaunchCard, PageHeading } from "@/components/site";

import { useStore, useDemo } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/c/$id")({
  head: () => seo("Shared collection", "A public collection of launches on Naviraa."),
  component: SharedCollection,
});

function SharedCollection() {
  const { launches } = useDemo();
  const { id } = Route.useParams();
  const { collections } = useStore();
  const c = collections.find((x) => x.id === id && x.isPublic);
  if (!c)
    return (
      <PageHeading eyebrow="Collection" title="This collection isn't public">
        It may be private or no longer exist.
      </PageHeading>
    );
  return (
    <>
      <PageHeading eyebrow="Local guide" title={c.name}>
        {c.launchSlugs.length} launches picked by a Naviraa member.
      </PageHeading>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {launches
          .filter((l) => c.launchSlugs.includes(l.slug))
          .map((l) => (
            <LaunchCard key={l.slug} launch={l} />
          ))}
      </div>
    </>
  );
}
