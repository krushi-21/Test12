import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Home,
  Compass,
  Rocket,
  LayoutGrid,
  MapPin,
  Trophy,
  Bookmark,
  Users,
  Layers,
  Store,
  ChartNoAxesCombined,
  Settings,
  Menu,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Plus,
  ArrowUpRight,
  CalendarDays,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/site";
import { useDemo, useStore } from "@/lib/store";
import { formatDate } from "@/lib/validation";

const discovery = [
  ["/", "Home", Home],
  ["/feed", "Discover", Compass],
  ["/launches", "Launches", Rocket],
  ["/explore", "Explore", LayoutGrid],
  ["/map", "Map", MapPin],
  ["/trending", "Leaderboard", Trophy],
  ["/saved", "Saved", Bookmark],
  ["/following", "Following", Users],
  ["/collections", "Collections", Layers],
] as const;
const workspace = [
  ["/dashboard", "My Business", Store],
  ["/analytics", "Analytics", ChartNoAxesCombined],
  ["/account", "Settings", Settings],
] as const;
function Navigation({ close }: { close?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Main navigation" className="space-y-1">
      {discovery.map(([to, label, Icon]) => (
        <Link
          key={to}
          to={to}
          onClick={close}
          className={`nav-link ${path === to || (to !== "/" && path.startsWith(to + "/")) ? "nav-active" : ""}`}
        >
          <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
          <span className="hidden lg:block">{label}</span>
          <span className="sr-only lg:hidden">{label}</span>
        </Link>
      ))}
      <p className="hidden pb-3 pt-8 text-xs text-muted-foreground lg:block">Your Workspace</p>
      <div className="pt-4 lg:pt-0">
        {workspace.map(([to, label, Icon]) => (
          <Link
            key={to}
            to={to}
            onClick={close}
            className={`nav-link ${path === to || (to === "/dashboard" && path.startsWith("/dashboard/")) ? "nav-active" : ""}`}
          >
            <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden lg:block">{label}</span>
            <span className="sr-only lg:hidden">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        void navigate({ to: "/explore", search: { q } });
      }}
      className={`flex min-w-0 items-center gap-2 rounded-lg bg-muted px-3 ${compact ? "py-2" : "py-3"}`}
    >
      <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        aria-label="Search Naviraa"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search businesses, founders, launches…"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label="Search"
        title="Search"
        className="h-7 w-7 shrink-0"
      >
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
function UserMenu() {
  const { user, set, notifications } = useStore();
  const { getFounder } = useDemo();
  const navigate = useNavigate();
  const founder = user?.founderSlug ? getFounder(user.founderSlug) : undefined;
  if (!user)
    return (
      <Link to="/signin" className="shrink-0 text-sm font-medium">
        Sign in
      </Link>
    );
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        to="/notifications"
        aria-label={`Notifications, ${unread} unread`}
        className="relative rounded-full p-2.5"
      >
        <Bell aria-hidden className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label="Account menu" className="gap-2 px-1">
            <Avatar
              photo={founder?.photo}
              initials={user.name.slice(0, 2).toUpperCase()}
              className="h-8 w-8 rounded-full bg-secondary text-xs"
            />
            <span className="hidden max-w-24 truncate text-xs md:block">{user.name}</span>
            <ChevronDown className="hidden h-3 w-3 md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/account">
              <Settings />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/dashboard">
              <Store />
              My Business
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              set((s) => ({ ...s, user: null }));
              void navigate({ to: "/" });
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { user } = useStore();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const auth = [
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ].includes(path);
  const right = ["/", "/feed", "/saved", "/following", "/collections", "/notifications"].includes(
    path,
  );
  return (
    <>
      <header className="app-header">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[160px_minmax(0,1fr)_auto] lg:grid-cols-[190px_minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  className="md:hidden"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-navigation w-72 overflow-y-auto">
                <SheetTitle className="mb-6 font-display text-2xl">naviraa</SheetTitle>
                <SheetDescription className="sr-only">
                  Discovery and workspace navigation
                </SheetDescription>
                <Navigation close={() => setDrawer(false)} />
              </SheetContent>
            </Sheet>
            <Link to="/" className="font-display text-3xl font-semibold">
              naviraa
            </Link>
          </div>
          <div className="hidden max-w-xl md:block">
            <GlobalSearch compact />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <UserMenu />
            <Button asChild className="hidden gap-2 lg:inline-flex">
              <Link to={user?.founderSlug ? "/dashboard" : "/signup"}>
                <Plus className="h-4 w-4" />
                Launch your business
              </Link>
            </Button>
          </div>
        </div>
      </header>
      {auth ? (
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      ) : (
        <div className="app-layout">
          <aside aria-label="Left sidebar" className="left-rail">
            <Navigation />
            <p className="mt-12 hidden text-[11px] leading-relaxed text-muted-foreground lg:block">
              India’s makers. Their next chapter.
            </p>
          </aside>
          <main id="main-content" tabIndex={-1} className={`app-main ${right ? "with-right" : ""}`}>
            {children}
          </main>
          {right && <RightSidebar />}
        </div>
      )}
      <footer className="shell-footer">
        Naviraa · India-first discovery · Sample records and browser-only interactions · Not a
        marketplace
      </footer>
    </>
  );
}
function Widget({
  title,
  icon,
  children,
  link,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  link?: ReactNode;
}) {
  return (
    <section className="sidebar-widget">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        {link}
      </div>
      {children}
    </section>
  );
}
export function RightSidebar() {
  const { user, saves, savedPosts, savedCollections, follows, notifications } = useStore();
  const { launches, getBusiness, businesses, founders } = useDemo();
  const unread = notifications.filter((n) => !n.read).length;
  const upcoming = launches.filter((l) => l.stage === "Coming Soon").slice(0, 3);
  return (
    <aside aria-label="Right sidebar" className="right-rail">
      <Widget title="Your Activity" icon={<Activity className="h-4 w-4" />}>
        <div className="grid grid-cols-3 gap-2">
          {[
            [
              saves.length + savedPosts.length + savedCollections.length,
              "Saved",
              "/saved",
              Bookmark,
            ],
            [
              follows.filter((f) => !f.startsWith("category:")).length,
              "Following",
              "/following",
              Users,
            ],
            [unread, "Unread", "/notifications", Bell],
          ].map(([n, label, to, Icon]) => {
            const I = Icon as typeof Bell;
            return (
              <Link
                key={String(label)}
                to={to as "/saved" | "/following" | "/notifications"}
                className="rounded-lg bg-secondary/50 py-3 text-center"
              >
                <I aria-hidden className="mx-auto mb-1 h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">{user ? String(n) : "—"}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{String(label)}</p>
              </Link>
            );
          })}
        </div>
      </Widget>
      <section className="rounded-lg bg-secondary p-5">
        <Rocket aria-hidden className="mb-3 h-7 w-7 text-primary" />
        <h2 className="text-sm font-semibold">Ready for your next chapter?</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Introduce your business to a community of curious people.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to={user?.founderSlug ? "/dashboard" : "/signup"}>
            <Plus className="h-4 w-4" />
            Launch your business
          </Link>
        </Button>
      </section>
      <Widget
        title="Upcoming Launches"
        icon={<CalendarDays className="h-4 w-4 text-primary" />}
        link={
          <Link to="/upcoming" className="text-[10px] text-primary">
            View all →
          </Link>
        }
      >
        <div className="space-y-4">
          {upcoming.map((l) => {
            const b = getBusiness(l.businessSlug);
            return b ? (
              <Link
                key={l.slug}
                to="/launches/$slug"
                params={{ slug: l.slug }}
                className="grid grid-cols-[44px_minmax(0,1fr)] gap-3"
              >
                <Avatar
                  photo={b.cover}
                  initials={b.name.slice(0, 2)}
                  className="h-11 w-11 rounded-md bg-muted"
                />
                <div>
                  <p className="text-xs font-semibold">{l.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{b.category}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(l.startsAt)} IST</p>
                </div>
              </Link>
            ) : null;
          })}
          {!upcoming.length && (
            <p className="text-xs text-muted-foreground">No upcoming launches yet.</p>
          )}
        </div>
      </Widget>
      <Widget
        title="Trending in the preview"
        icon={<ChartNoAxesCombined className="h-4 w-4 text-primary" />}
        link={
          <Link to="/trending" className="text-[10px] text-primary">
            View all →
          </Link>
        }
      >
        <div className="space-y-3">
          {businesses
            .filter((b) =>
              launches.some((l) => l.businessSlug === b.slug && l.stage === "Trending"),
            )
            .slice(0, 3)
            .map((b) => (
              <Link
                key={b.slug}
                to="/businesses/$slug"
                params={{ slug: b.slug }}
                className="flex items-center gap-3"
              >
                <Avatar
                  photo={b.cover}
                  initials={b.name.slice(0, 2)}
                  className="h-10 w-10 rounded-md bg-muted"
                />
                <div>
                  <p className="text-xs font-semibold">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground">{b.category} · Sample</p>
                </div>
              </Link>
            ))}
        </div>
      </Widget>
      <Widget title="Founders to know" icon={<Users className="h-4 w-4 text-primary" />}>
        <div className="space-y-3">
          {founders
            .filter((f) => !follows.includes(`founder:${f.slug}`))
            .slice(0, 3)
            .map((f) => (
              <Link
                key={f.slug}
                to="/founders/$slug"
                params={{ slug: f.slug }}
                className="flex items-center gap-3"
              >
                <Avatar
                  photo={f.photo}
                  initials={f.initials}
                  className="h-9 w-9 rounded-full bg-muted"
                />
                <div>
                  <p className="text-xs font-semibold">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">{f.city}</p>
                </div>
              </Link>
            ))}
        </div>
      </Widget>
    </aside>
  );
}
