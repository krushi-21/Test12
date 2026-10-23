import { createFileRoute, Link } from "@tanstack/react-router";
import { sharePage } from "@/lib/share";
import { formatDate, isHttps } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore, useDemo } from "@/lib/store";
import { CommentSection } from "@/components/comments";
import { Cover, StageBadge } from "@/components/site";
import { getLaunch } from "@/lib/demo";

export const Route = createFileRoute("/launches_/$slug")({
  loader: ({ params }) => {
    const launch = getLaunch(params.slug);
    return { launch };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.launch
      ? `${loaderData.launch.title} — Naviraa`
      : "Launch unavailable — Naviraa";
    const d = loaderData?.launch?.summary ?? "This launch could not be found.";
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: LaunchDetail,
});

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0)
    return <p className="text-sm text-accent">● Live since {formatDate(to) + " IST"}</p>;
  const s = Math.floor(diff / 1000);
  const parts = [
    ["days", Math.floor(s / 86400)],
    ["hrs", Math.floor((s % 86400) / 3600)],
    ["min", Math.floor((s % 3600) / 60)],
    ["sec", s % 60],
  ] as const;
  return (
    <div className="grid grid-cols-4 gap-2">
      {parts.map(([l, v]) => (
        <div key={l} className="rounded-xl bg-secondary px-2 py-3 text-center">
          <p className="font-display text-2xl font-semibold">{v}</p>
          <p className="text-xs text-muted-foreground">{l}</p>
        </div>
      ))}
    </div>
  );
}

function LaunchDetail() {
  const { slug } = Route.useParams();
  const { getLaunch, getBusiness, getFounder } = useDemo();
  const launch = getLaunch(slug);
  const b = launch ? getBusiness(launch.businessSlug) : undefined;
  const f = b ? getFounder(b.founderSlug) : undefined;
  const { user, likes, saves, reminders, collections, ownLaunches, toggle, set, notify } =
    useStore();
  if (!launch || !b || !f)
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="font-display text-3xl">Launch unavailable</h1>
        <p className="mt-3">This launch may be private, paused, archived or removed.</p>
        <Link to="/launches" className="mt-4 inline-block text-primary">
          Browse launches
        </Link>
      </div>
    );
  const liked = likes.includes(launch.slug);
  const saved = saves.includes(launch.slug);
  const reminding = reminders.includes(launch.slug);
  const gate = (fn: () => void) => () => {
    if (!user) return void toast("Sign in to do that");
    if (!user.verified) return void toast("Verify your email first");
    fn();
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/launches" className="text-sm text-muted-foreground hover:text-primary">
        ← All launches
      </Link>
      <Cover hue={b.hue} src={b.cover} label={b.name} className="mt-4 h-64 md:h-80" />
      {ownLaunches.find((l) => l.id === slug)?.images.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ownLaunches
            .find((l) => l.id === slug)
            ?.images.map((image) => (
              <img
                key={image.url}
                src={image.url}
                alt={image.alt}
                width={1280}
                height={720}
                className="aspect-video w-full rounded-lg object-cover"
              />
            ))}
        </div>
      ) : null}
      <div className="mt-8 grid gap-10 md:grid-cols-[2fr_1fr]">
        <div>
          <StageBadge stage={launch.stage} />
          <h1 className="mt-3 font-display text-4xl font-semibold md:text-5xl">{launch.title}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{launch.summary}</p>
          <div className="mt-6">
            <Countdown to={launch.startsAt} />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              variant="ghost"
              onClick={gate(() => toggle("likes", launch.slug))}
              className={`rounded-full px-5 py-2.5 text-sm font-medium ${liked ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
            >
              ♥ {launch.likes + (liked ? 1 : 0)}
            </Button>
            <Button
              variant="ghost"
              onClick={gate(() => toggle("saves", launch.slug))}
              className={`rounded-full px-5 py-2.5 text-sm font-medium ${saved ? "bg-accent text-accent-foreground" : "border border-border bg-card"}`}
            >
              ☆ {saved ? "Saved" : "Save"}
            </Button>
            {launch.stage === "Coming Soon" && (
              <Button
                variant="ghost"
                onClick={gate(() => {
                  toggle("reminders", launch.slug);
                  if (!reminding) notify(`Reminder set for ${launch.title}`, "launch");
                })}
                className={`rounded-full px-5 py-2.5 text-sm font-medium ${reminding ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
              >
                🔔 {reminding ? "Reminding" : "Remind me"}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                void sharePage(`/launches/${encodeURIComponent(launch.slug)}`, launch.title, true);
              }}
              className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium"
            >
              ↗ Share
            </Button>
            {isHttps(b.website) && (
              <a
                href={b.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background"
              >
                Visit website ↗
              </a>
            )}
          </div>
          <CommentSection launchSlug={launch.slug} total={launch.comments} />
        </div>
        <aside className="space-y-4">
          {user?.verified && collections.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Add to collection
              </p>
              <div className="mt-3 space-y-2">
                {collections.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={c.launchSlugs.includes(launch.slug)}
                      onChange={(e) =>
                        set((s) => ({
                          ...s,
                          collections: s.collections.map((x) =>
                            x.id === c.id
                              ? {
                                  ...x,
                                  launchSlugs: e.target.checked
                                    ? [...x.launchSlugs, launch.slug]
                                    : x.launchSlugs.filter((y) => y !== launch.slug),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Link
            to="/businesses/$slug"
            params={{ slug: b.slug }}
            className="block rounded-2xl border border-border bg-card p-5 hover:border-primary"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Business</p>
            <p className="mt-1 font-display text-xl font-semibold">{b.name}</p>
            <p className="text-sm text-muted-foreground">
              {b.area}, {b.city}
            </p>
          </Link>
          <Link
            to="/founders/$slug"
            params={{ slug: f.slug }}
            className="block rounded-2xl border border-border bg-card p-5 hover:border-primary"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Founder</p>
            <p className="mt-1 font-semibold">
              {f.name}{" "}
              {f.pronouns && (
                <span className="text-xs font-normal text-muted-foreground">({f.pronouns})</span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{f.bio}</p>
          </Link>
        </aside>
      </div>
    </div>
  );
}
