import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Grid2X2,
  Utensils,
  Shirt,
  Flower2,
  Monitor,
  GraduationCap,
  Sparkles,
  Palette,
} from "lucide-react";
import { useDemo, useStore } from "@/lib/store";
import { BusinessCard, Avatar } from "@/components/site";
import { GlobalSearch } from "@/components/app-shell";
import { FollowButton } from "@/components/reviews";
import { seo } from "@/lib/seo";
import { categories } from "@/lib/demo";
export const Route = createFileRoute("/")({
  head: () =>
    seo(
      "Naviraa — Discover what India is building",
      "Your personal guide to Indian businesses, upcoming launches, founders and collections.",
    ),
  component: Home,
});
const icons = [Shirt, Utensils, Flower2, Palette, Monitor, GraduationCap, Sparkles, Grid2X2];
function Home() {
  const { businesses, founders, launches, getBusiness } = useDemo();
  const { user, collections, notifications, saves, follows } = useStore();
  const featured = businesses[0];
  return (
    <>
      <section className="home-cover">
        <img
          src={featured?.cover}
          alt={featured?.name ?? "Naviraa community"}
          width={1280}
          height={720}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative z-10 max-w-lg px-6 py-8 text-image-foreground sm:px-8">
          <p className="mb-3 text-xs">
            {user
              ? `Welcome back, ${user.name.split(" ")[0]}`
              : "Welcome to India’s maker community"}
          </p>
          <h1 className="font-display text-4xl font-medium leading-tight">
            Discover what
            <br />
            India is building.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-image-foreground/90">
            Meet independent businesses, follow their next big idea, and find something worth
            knowing.
          </p>
          <div className="mt-6 text-foreground">
            <GlobalSearch />
          </div>
        </div>
      </section>
      <div className="my-6 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {categories.map((c, i) => {
          const Icon = icons[i] ?? Grid2X2;
          return (
            <Link
              key={c}
              to="/explore"
              search={{ category: c }}
              className="rounded-lg px-1 py-2 text-center hover:bg-secondary"
            >
              <Icon aria-hidden className="mx-auto mb-2 h-5 w-5 text-primary" />
              <span className="block text-[10px] text-muted-foreground">{c}</span>
            </Link>
          );
        })}
      </div>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recommended for you</h2>
          <Link to="/explore" className="text-xs text-primary">
            Explore all →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {businesses.slice(0, 4).map((b) => (
            <BusinessCard key={b.slug} business={b} />
          ))}
        </div>
      </section>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Upcoming launches</h2>
          <Link to="/upcoming" className="text-xs text-primary">
            View calendar →
          </Link>
        </div>
        {launches
          .filter((l) => l.stage === "Coming Soon")
          .map((l) => {
            const b = getBusiness(l.businessSlug);
            return (
              <Link
                key={l.slug}
                to="/launches/$slug"
                params={{ slug: l.slug }}
                className="mb-3 flex items-center gap-4 rounded-lg bg-card p-4"
              >
                <Avatar
                  photo={b?.cover}
                  initials={b?.name.slice(0, 2) ?? "N"}
                  className="h-14 w-14 rounded-lg bg-muted"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{l.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {b?.name} · {b?.city}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-primary" />
              </Link>
            );
          })}
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-base font-semibold">Founders to follow</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {founders.slice(0, 4).map((f) => (
            <div key={f.slug} className="rounded-lg bg-card p-4">
              <Link
                to="/founders/$slug"
                params={{ slug: f.slug }}
                className="flex items-center gap-3"
              >
                <Avatar
                  photo={f.photo}
                  initials={f.initials}
                  className="h-10 w-10 rounded-full bg-muted"
                />
                <div>
                  <p className="text-sm font-semibold">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.city}</p>
                </div>
              </Link>
              <div className="mt-3">
                <FollowButton id={`founder:${f.slug}`} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-base font-semibold">Preview collections</h2>
        {collections
          .filter((c) => c.isPublic)
          .map((c) => (
            <Link
              key={c.id}
              to="/c/$id"
              params={{ id: c.id }}
              className="mb-3 block rounded-lg bg-card p-5"
            >
              <h3 className="font-display text-xl">{c.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.launchSlugs.length} launches · Available in this browser only
              </p>
            </Link>
          ))}
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-base font-semibold">Recent activity</h2>
        {user ? (
          notifications.slice(0, 3).map((n) => (
            <Link
              key={n.id}
              to="/notifications"
              className="mb-2 block rounded-lg bg-card p-4 text-sm"
            >
              {n.text}
              <span className="ml-2 text-[10px] text-muted-foreground">Preview</span>
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in to see your browser-preview activity.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          <Link to="/saved" className="text-primary">
            Saved businesses{" "}
            {user ? `(${saves.filter((s) => s.startsWith("business:")).length})` : ""} →
          </Link>
          <Link to="/following" className="text-primary">
            Following {user ? `(${follows.filter((s) => s.startsWith("founder:")).length})` : ""} →
          </Link>
          <Link to="/trending" className="text-primary">
            Trending in the preview →
          </Link>
        </div>
      </section>
    </>
  );
}
