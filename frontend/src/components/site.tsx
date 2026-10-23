import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, LayoutDashboard, LogOut, User } from "lucide-react";
import { useStore, useDemo } from "@/lib/store";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { type Business, type Launch, type Stage } from "@/lib/demo";

export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M6 28V16a10 10 0 0 1 20 0v12" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M16 8l1.6 3.4 3.7.5-2.7 2.6.7 3.7L16 16.4l-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z"
        fill="currentColor"
      />
    </svg>
  );
}

const nav = [
  { to: "/feed", label: "Community" },
  { to: "/launches", label: "Launches" },
  { to: "/businesses", label: "Businesses" },
  { to: "/founders", label: "Founders" },
  { to: "/map", label: "Map" },
  { to: "/upcoming", label: "Upcoming" },
  { to: "/trending", label: "Trending" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link to="/" className="flex shrink-0 items-center gap-2 text-primary">
          <Mark />
          <span className="whitespace-nowrap font-display text-2xl font-semibold text-foreground">
            Naviraa
          </span>
        </Link>
        <nav aria-label="Primary navigation" className="hidden gap-1 xl:flex">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Account />
      </div>
      <nav
        aria-label="Mobile navigation"
        className="flex gap-1 overflow-x-auto px-4 pb-2 xl:hidden"
      >
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="shrink-0 whitespace-nowrap rounded-full px-3 py-2.5 text-sm text-muted-foreground"
            activeProps={{ className: "bg-secondary text-foreground" }}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function Account() {
  const { user, notifications, set } = useStore();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;
  if (!user)
    return (
      <div className="flex items-center gap-2">
        <Link to="/signin" className="rounded-full px-4 py-2 text-sm font-medium hover:bg-muted">
          Sign in
        </Link>
        <Link
          to="/signup"
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Join
        </Link>
      </div>
    );
  return (
    <div className="flex shrink-0 items-center gap-0">
      <Link
        to="/notifications"
        aria-label="Notifications"
        className="relative rounded-full p-2.5 hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {unread}
          </span>
        )}
      </Link>
      {user.founderSlug && (
        <Link
          to="/dashboard"
          title="Founder workspace"
          aria-label="Founder workspace"
          className="rounded-full p-2.5 hover:bg-muted"
        >
          <LayoutDashboard className="h-5 w-5" />
        </Link>
      )}
      <Link to="/account" aria-label="Account" className="rounded-full p-2.5 hover:bg-muted">
        <User className="h-5 w-5" />
      </Link>
      <Button
        variant="ghost"
        title="Sign out"
        aria-label="Sign out"
        onClick={() => {
          set((s) => ({ ...s, user: null }));
          navigate({ to: "/" });
        }}
        className="rounded-full p-2.5 hover:bg-muted"
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 bg-foreground text-background">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3">
        <div>
          <div className="flex shrink-0 items-center gap-2 text-primary">
            <Mark />
            <span className="font-display text-2xl text-background">Naviraa</span>
          </div>
          <p className="mt-3 text-sm opacity-70">Discover what India is building.</p>
        </div>
        <p className="text-sm opacity-70 md:col-span-2">
          Naviraa is a launch and discovery community, not a marketplace. Product links go straight
          to each business's own website — we never handle carts, checkout or payments. “Verified”
          means the managing account verified its email. All records in this preview are fictional.
        </p>
      </div>
    </footer>
  );
}

export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl font-semibold md:text-5xl">{title}</h1>
      {children && <p className="mt-3 max-w-2xl text-muted-foreground">{children}</p>}
    </div>
  );
}

const stageStyle: Record<Stage, string> = {
  "Coming Soon": "bg-secondary text-secondary-foreground",
  "Launching Today": "bg-primary text-primary-foreground",
  Live: "bg-accent text-accent-foreground",
  Trending: "bg-foreground text-background",
  Established: "bg-muted text-muted-foreground",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stageStyle[stage]}`}>
      {stage}
    </span>
  );
}

export function Cover({
  label,
  src,
  className = "h-40",
}: {
  hue: number;
  label: string;
  src?: string | undefined;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative flex items-end overflow-hidden rounded-xl bg-secondary p-4 ${className}`}
    >
      {src && !failed ? (
        <>
          <img
            src={src}
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div aria-hidden className="cover-shade absolute inset-0" />
        </>
      ) : (
        <Mark className="absolute right-4 top-4 h-20 w-20 text-primary/30" />
      )}
      <span
        className={`relative z-10 font-display text-xl font-semibold ${src && !failed ? "text-image-foreground" : "text-secondary-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

export function Avatar({
  initials,
  photo,
  className = "",
}: {
  initials: string;
  photo?: string | undefined;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const base = `${className} flex shrink-0 items-center justify-center overflow-hidden`;
  if (photo && !failed)
    return (
      <img
        src={photo}
        alt=""
        width={512}
        height={640}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    );
  return <span className={`${base} font-semibold`}>{initials}</span>;
}

export function PreviewStatus() {
  const { storageError } = useStore();
  return (
    <>
      <div className="border-b border-border bg-secondary px-4 py-2 text-center text-xs">
        Frontend preview · sample data · changes stay in this browser · no emails are sent
      </div>
      {storageError && (
        <p role="alert" className="bg-destructive px-4 py-3 text-sm text-destructive-foreground">
          {storageError}
        </p>
      )}
    </>
  );
}

export function LaunchCard({ launch }: { launch: Launch }) {
  const { getBusiness } = useDemo();
  const { comments } = useStore();
  const b = getBusiness(launch.businessSlug);
  if (!b) return null;
  return (
    <Link
      to="/launches/$slug"
      params={{ slug: launch.slug }}
      className="group block rounded-2xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <Cover hue={b.hue} src={b.cover} label={b.name} />
      <div className="p-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <StageBadge stage={launch.stage} />
          <span className="text-xs text-muted-foreground">{b.city}</span>
        </div>
        <h3 className="mt-3 font-display text-xl font-semibold group-hover:text-primary">
          {launch.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{launch.summary}</p>
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <span>♥ {launch.likes}</span>
          <span>☆ {launch.saves} saves</span>
          <span>💬 {2 + comments.filter((c) => c.launchSlug === launch.slug).length}</span>
        </div>
      </div>
    </Link>
  );
}

export function BusinessCard({ business: b }: { business: Business }) {
  return (
    <Link
      to="/businesses/$slug"
      params={{ slug: b.slug }}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:shadow-lg"
    >
      {b.cover && (
        <img
          src={b.cover}
          alt=""
          width={1280}
          height={720}
          loading="lazy"
          className="mb-4 aspect-[16/7] w-full rounded-xl object-cover"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold group-hover:text-primary">{b.name}</h3>
          <p className="text-sm text-muted-foreground">{b.tagline}</p>
        </div>
        <span className="rounded-full shrink-0 bg-muted px-2 py-1 text-xs">★ {b.rating}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-secondary px-2.5 py-1">{b.category}</span>
        <span className="rounded-full border border-border px-2.5 py-1 capitalize">{b.mode}</span>
        <span className="rounded-full border border-border px-2.5 py-1">
          {b.area}, {b.city}
        </span>
        {b.verified && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
            ✓ Email verified
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-1 ${b.openNow ? "text-accent" : "text-muted-foreground"}`}
        >
          {b.openNow ? "● Open now" : "○ Closed"}
        </span>
      </div>
    </Link>
  );
}
