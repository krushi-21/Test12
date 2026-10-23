import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeading } from "@/components/site";
import { btnOutline, btnPrimary, Panel, SignedIn } from "@/components/bits";
import { analyticsDaily, trafficSources } from "@/lib/demo";
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
      <PageHeading eyebrow="Founder workspace" title="Your dashboard" />
      <div className="mx-auto max-w-6xl px-4">
        <SignedIn what="open your workspace">
          <Workspace />
        </SignedIn>
      </div>
    </>
  );
}

function Workspace() {
  const { businesses, launches } = useDemo();
  const { user, ownLaunches, set } = useStore();
  const [range, setRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const mine = businesses.filter((b) => b.founderSlug === user?.founderSlug);
  const visibleLaunches = ownLaunches.filter((l) => mine.some((b) => b.slug === l.businessSlug));
  const data =
    range === "daily"
      ? analyticsDaily.slice(-7)
      : range === "weekly"
        ? analyticsDaily.slice(-14)
        : analyticsDaily;
  const totals = data.reduce(
    (a, d) => ({
      visits: a.visits + d.visits,
      clicks: a.clicks + d.clicks,
      saves: a.saves + d.saves,
    }),
    { visits: 0, clicks: 0, saves: 0 },
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

      <p className="text-sm text-muted-foreground">
        Sample analytics · not measured visitor activity. Outbound clicks ÷ profile visits gives
        website conversion; no sales are tracked.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Profile visits", totals.visits],
          ["Outbound clicks", totals.clicks],
          ["Saves", totals.saves],
          ["Website conversion", `${((totals.clicks / totals.visits) * 100).toFixed(1)}%`],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {typeof v === "number" ? v.toLocaleString("en-IN") : v}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Traffic"
          action={
            <div className="inline-flex rounded-full bg-muted p-1 text-xs">
              {(["daily", "weekly", "monthly"] as const).map((r) => (
                <Button
                  variant="ghost"
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1 capitalize ${range === r ? "bg-card shadow" : ""}`}
                >
                  {r === "daily" ? "7 days" : r === "weekly" ? "14 days" : "30 days"}
                </Button>
              ))}
            </div>
          }
        >
          <div className="h-64 min-w-0">
            <ResponsiveContainer>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                />
                <Area
                  dataKey="visits"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.2}
                />
                <Area
                  dataKey="clicks"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Traffic sources">
          <div className="h-64 min-w-0">
            <ResponsiveContainer>
              <BarChart data={trafficSources} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="source"
                  width={100}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Your launches">
        {visibleLaunches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No launches yet. Create a business, then save your first launch draft.
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
          {mine.map((b) => (
            <div key={b.slug} className="rounded-xl border border-border p-4">
              <p className="font-display text-lg font-semibold">{b.name}</p>
              <p className="text-sm text-muted-foreground">
                {b.products.length}/12 catalog items · ★ {b.rating}
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
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No businesses yet.</p>}
        </div>
      </Panel>
    </div>
  );
}
