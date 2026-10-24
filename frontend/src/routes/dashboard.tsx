import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeading } from "@/components/site";
import { btnOutline, btnPrimary, Panel, SignedIn } from "@/components/bits";
import { Avatar } from "@/components/site";
import { useStore, useDemo, type LaunchStatus } from "@/lib/store";
import { ConfirmAction } from "@/components/actions";
import { formatDate } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/dashboard")({
  head: () =>
    seo("Founder workspace", "Manage your businesses, launches and private analytics.", true),
  component: Dashboard,
});

const statusStyle: Record<LaunchStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-accent text-accent-foreground",
  paused: "bg-secondary text-secondary-foreground",
  archived: "border border-border text-muted-foreground",
};

function Dashboard() {
  return (
    <>
      <PageHeading eyebrow="Founder workspace" title="My Business" />
      <div className="mx-auto max-w-6xl px-4">
        <SignedIn what="open your workspace">
          <Workspace />
        </SignedIn>
      </div>
    </>
  );
}

function Workspace() {
  const { businesses } = useDemo();
  const { user, ownLaunches, set } = useStore();
  const [selected, setSelected] = useState("");
  const mine = businesses.filter((b) => b.founderSlug === user?.founderSlug);
  const visibleLaunches = ownLaunches.filter(
    (l) =>
      mine.some((b) => b.slug === l.businessSlug) && (!selected || l.businessSlug === selected),
  );
  const setStatus = (id: string, status: LaunchStatus) =>
    set((s) => ({
      ...s,
      ownLaunches: s.ownLaunches.map((l) => (l.id === id ? { ...l, status } : l)),
    }));

  return (
    <div className="space-y-8">
      {!user?.verified && (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm">
          Verify your email to publish launches.{" "}
          <Link to="/verify-email" className="font-medium text-primary">
            Verify now
          </Link>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link to="/dashboard/launch/$id" params={{ id: "new" }} className={btnPrimary}>
          + New launch
        </Link>
        <Link to="/dashboard/business/$slug" params={{ slug: "new" }} className={btnOutline}>
          + Add business
        </Link>
        <Link to="/account" className={btnOutline}>
          Edit founder profile
        </Link>
      </div>

      <div>
        <label className="block text-xs font-medium">
          Business selector
          <select
            aria-label="Managed business"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-2 w-full max-w-sm rounded-lg border border-input bg-card px-3 py-2.5 text-sm"
          >
            <option value="">All your businesses</option>
            {mine.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Your browser-preview workspace. Posts and edits stay in this browser. Visitor metrics are
        not connected.{" "}
        <Link to="/analytics" className="text-primary">
          View local analytics →
        </Link>
      </p>
      <Panel title="Your launches">
        {visibleLaunches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No launches yet. Create a business, then save your first launch draft.{" "}
            <Link to="/dashboard/launch/$id" params={{ id: "new" }} className="text-primary">
              Create launch
            </Link>
          </p>
        )}
        <div className="divide-y divide-border">
          {visibleLaunches.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="flex-1">
                <p className="font-medium">{l.title}</p>
                <p className="text-xs text-muted-foreground">
                  {businesses.find((b) => b.slug === l.businessSlug)?.name} · starts{" "}
                  {formatDate(l.startsAt) + " IST"}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle[l.status]}`}
              >
                {l.status}
              </span>
              <div className="flex gap-2 text-sm">
                <Link
                  to="/dashboard/launch/$id"
                  params={{ id: l.id }}
                  className="rounded-full border border-border px-3 py-1.5"
                >
                  Edit
                </Link>
                {l.status !== "published" && l.status !== "archived" && (
                  <Button
                    variant="ghost"
                    disabled={!user?.verified}
                    onClick={() => setStatus(l.id, "published")}
                    className="rounded-full bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
                  >
                    Publish
                  </Button>
                )}
                {l.status === "published" && (
                  <Button
                    variant="ghost"
                    onClick={() => setStatus(l.id, "paused")}
                    className="rounded-full border border-border px-3 py-1.5"
                  >
                    Pause
                  </Button>
                )}
                {l.status !== "archived" ? (
                  <ConfirmAction
                    title="Archive this launch?"
                    description="It will disappear from discovery in this preview. You can restore it to a draft."
                    onConfirm={() => setStatus(l.id, "archived")}
                  >
                    Archive
                  </ConfirmAction>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setStatus(l.id, "draft")}
                    className="rounded-full px-3 py-1.5 text-muted-foreground"
                  >
                    Restore to draft
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Your businesses">
        <div className="grid gap-4 md:grid-cols-2">
          {mine
            .filter((b) => !selected || b.slug === selected)
            .map((b) => (
              <div key={b.slug} className="rounded-xl border border-border p-4">
                <Avatar
                  photo={b.cover}
                  initials={b.name.slice(0, 2)}
                  className="mb-3 aspect-video w-full rounded-lg bg-muted"
                />
                <p className="text-base font-semibold">{b.name}</p>
                <p className="text-sm text-muted-foreground">
                  {b.products.length}/12 catalog items · {b.city}
                </p>
                <div className="mt-3 flex gap-2 text-sm">
                  <Link
                    to="/dashboard/business/$slug"
                    params={{ slug: b.slug }}
                    className="rounded-full bg-foreground px-3 py-1.5 text-background"
                  >
                    Manage
                  </Link>
                  <Link
                    to="/businesses/$slug"
                    params={{ slug: b.slug }}
                    className="rounded-full border border-border px-3 py-1.5"
                  >
                    View public page
                  </Link>
                </div>
              </div>
            ))}
          {mine.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No businesses yet.{" "}
              <Link
                to="/dashboard/business/$slug"
                params={{ slug: "new" }}
                className="text-primary"
              >
                Add business
              </Link>
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
