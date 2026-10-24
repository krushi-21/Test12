import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/site";
import { useStore, useDemo } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/upcoming")({
  head: () =>
    seo("Upcoming launches", "Launch calendar and anniversaries of businesses across India."),
  component: Upcoming,
});

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

function Upcoming() {
  const { launches, getBusiness } = useDemo();
  const { reminders, toggle, user } = useStore();
  const sorted = [...launches].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = sorted.filter((l) => l.stage === "Coming Soon" || l.stage === "Launching Today");
  const anniversaries = sorted.filter((l) => l.stage === "Established");
  return (
    <>
      <PageHeading eyebrow="Calendar" title="Upcoming launches">
        Launch schedules are shown in IST. Reminders are saved only in this browser preview.
      </PageHeading>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[2fr_1fr]">
        <ol className="space-y-3">
          {upcoming.map((l) => {
            const b = getBusiness(l.businessSlug);
            if (!b) return null;
            const on = reminders.includes(l.slug);
            return (
              <li
                key={l.slug}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:flex sm:gap-5 sm:p-5"
              >
                <div className="w-16 shrink-0 text-center sm:w-20">
                  <p className="text-xs uppercase text-muted-foreground">
                    {fmt(l.startsAt).split(" ")[0]}
                  </p>
                  <p className="font-display text-2xl font-semibold text-primary">
                    {fmt(l.startsAt).split(" ").slice(1).join(" ")}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/launches/$slug"
                    params={{ slug: l.slug }}
                    className="font-display text-lg font-semibold hover:text-primary"
                  >
                    {l.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {b.name} · {b.city}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  aria-pressed={on}
                  onClick={() => {
                    if (!user) return void toast("Sign in to set reminders");
                    if (!user.verified) return void toast("Verify your email to set reminders");
                    if (user.founderSlug === b.founderSlug)
                      return void toast("You manage this launch");
                    toggle("reminders", l.slug);
                    toast.success(on ? "Reminder removed" : "Reminder saved in this preview");
                  }}
                  className={`col-span-2 flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm sm:col-span-1 ${on ? "bg-primary text-primary-foreground" : "border border-border"}`}
                >
                  {on ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  {on ? "Reminding" : "Remind me"}
                </Button>
              </li>
            );
          })}
          {upcoming.length === 0 && (
            <li role="status">
              No upcoming launches.{" "}
              <Link to="/launches" className="text-primary">
                Explore launches
              </Link>
            </li>
          )}
        </ol>

        <aside>
          <h2 className="font-display text-2xl font-semibold">Anniversaries</h2>
          {anniversaries.length === 0 && (
            <p role="status" className="mt-4 text-muted-foreground">
              No anniversaries listed.{" "}
              <Link to="/launches" className="text-primary">
                Explore launches
              </Link>
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {anniversaries.map((l) => (
              <li key={l.slug} className="rounded-2xl bg-secondary p-4">
                <p className="text-xs text-muted-foreground">Launched {fmt(l.startsAt)}</p>
                <Link
                  to="/launches/$slug"
                  params={{ slug: l.slug }}
                  className="font-medium hover:text-primary"
                >
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
