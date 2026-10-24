import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/site";
import { SignedIn } from "@/components/bits";
import { useDemo, useStore } from "@/lib/store";
import { displayedComments } from "@/lib/activity";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/analytics")({
  head: () =>
    seo("Analytics", "Browser-preview engagement for your Naviraa businesses and launches.", true),
  component: Analytics,
});
function Analytics() {
  const { user, likes, saves, savedPosts, comments, follows } = useStore();
  const { businesses, launches } = useDemo();
  const bs = businesses.filter((b) => b.founderSlug === user?.founderSlug);
  const ls = launches.filter((l) => bs.some((b) => b.slug === l.businessSlug));
  return (
    <>
      <PageHeading eyebrow="Workspace" title="Analytics">
        Activity created in this browser preview. Visitor analytics and cross-user metrics are not
        connected.
      </PageHeading>
      <SignedIn what="see analytics">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Local likes", ls.filter((l) => likes.includes(l.slug)).length],
            [
              "Local saves",
              ls.filter((l) => saves.includes(l.slug) || savedPosts.includes(l.slug)).length,
            ],
            [
              "Local comments",
              comments.filter((c) => ls.some((l) => l.slug === c.launchSlug)).length,
            ],
          ].map(([label, n]) => (
            <div key={label} className="rounded-lg bg-card p-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 font-display text-3xl">{n}</p>
            </div>
          ))}
        </div>
        <section className="mt-8">
          <h2 className="mb-4 text-base font-semibold">Post performance · Local only</h2>
          <div className="space-y-3">
            {ls.map((l) => (
              <div
                key={l.slug}
                className="grid gap-3 rounded-lg bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <p className="text-sm font-semibold">{l.title}</p>
                <p className="text-xs text-muted-foreground">
                  {likes.includes(l.slug) ? 1 : 0} likes · {saves.includes(l.slug) ? 1 : 0} launch
                  saves · {savedPosts.includes(l.slug) ? 1 : 0} post saves ·{" "}
                  {displayedComments(l.slug, comments).filter((c) => !c.sample).length} local
                  comments
                </p>
              </div>
            ))}
            {!ls.length && (
              <p className="text-sm text-muted-foreground">
                No published launches to report on yet.
              </p>
            )}
          </div>
        </section>
        <p className="mt-8 rounded-lg bg-secondary p-4 text-sm text-muted-foreground">
          Views, reach, visitor history and follower totals across accounts are unavailable.{" "}
          {follows.filter((f) => bs.some((b) => f === `business:${b.slug}`)).length} business
          follows exist in this browser. No sales or revenue are tracked.
        </p>
      </SignedIn>
    </>
  );
}
