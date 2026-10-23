import { useDemo, useStore } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, Cover, LaunchCard } from "@/components/site";
import { FollowButton, ReviewSection } from "@/components/reviews";
import { formatInr, getBusiness } from "@/lib/demo";
import { isHttps } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/businesses_/$slug")({
  loader: ({ params }) => {
    const business = getBusiness(params.slug);
    return { business };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.business
      ? `${loaderData.business.name} — Naviraa`
      : "Business unavailable — Naviraa";
    const d = loaderData?.business?.description ?? "This business could not be found.";
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
  component: BusinessDetail,
});

function BusinessDetail() {
  const { slug } = Route.useParams();
  const { getBusiness, getFounder, launches } = useDemo();
  const { saves, toggle, user } = useStore();
  const b = getBusiness(slug);
  const f = b ? getFounder(b.founderSlug) : undefined;
  if (!b || !f)
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="font-display text-3xl">Business unavailable</h1>
        <Link to="/businesses" className="mt-4 inline-block text-primary">
          Browse businesses
        </Link>
      </div>
    );
  const own = launches.filter((l) => l.businessSlug === b.slug);
  const actions = [
    { label: "Website", href: b.website },
    b.whatsapp && { label: "WhatsApp", href: `https://wa.me/${b.whatsapp.replace(/\D/g, "")}` },
    b.phone && { label: "Call", href: `tel:${b.phone.replace(/\s/g, "")}` },
    b.email && { label: "Email", href: `mailto:${b.email}` },
    b.mode !== "online" && {
      label: "Directions",
      href: `https://www.google.com/maps/search/${encodeURIComponent(`${b.name} ${b.area} ${b.city}`)}`,
    },
  ].filter(
    (action): action is { label: string; href: string } =>
      Boolean(action) &&
      typeof action === "object" &&
      (isHttps(action.href) || action.href.startsWith("tel:") || action.href.startsWith("mailto:")),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/businesses" className="text-sm text-muted-foreground hover:text-primary">
        ← All businesses
      </Link>
      <Cover hue={b.hue} src={b.cover} label={b.tagline} className="mt-4 h-56" />
      <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">{b.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {b.category} · {b.area}, {b.city}, {b.state} ·{" "}
            <span className="capitalize">{b.mode}</span>
          </p>
          {b.verified && (
            <p className="mt-2 text-sm text-accent">✓ Managing account has verified its email</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <FollowButton id={`business:${b.slug}`} />
          <Button
            variant="outline"
            onClick={() => {
              if (!user) return void toast("Sign in to save businesses");
              if (!user.verified) return void toast("Verify your email to save businesses");
              toggle("saves", `business:${b.slug}`);
            }}
          >
            {saves.includes(`business:${b.slug}`) ? "Saved" : "Save business"}
          </Button>
          {actions.map((a, i) => (
            <a
              key={a.label}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full px-5 py-2.5 text-sm font-medium ${i === 0 ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:border-primary"}`}
            >
              {a.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-10">
          <p className="text-lg">{b.description}</p>
          <section>
            <h2 className="font-display text-2xl font-semibold">Catalog</h2>
            <p className="text-sm text-muted-foreground">
              Links open the business's own site. Naviraa doesn't sell anything.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {b.products
                .filter((p) => isHttps(p.url))
                .map((p) => (
                  <a
                    key={p.name}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {p.priceInr !== undefined ? formatInr(p.priceInr) : ""} ↗
                    </span>
                  </a>
                ))}
            </div>
          </section>
          {own.length > 0 && (
            <section>
              <h2 className="font-display text-2xl font-semibold">Launches</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {own.map((l) => (
                  <LaunchCard key={l.slug} launch={l} />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="font-display text-2xl font-semibold">Reviews</h2>
            <ReviewSection business={b} />
          </section>
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Founder</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar
                initials={f.initials}
                photo={f.photo}
                className="h-12 w-12 rounded-full bg-accent text-sm text-accent-foreground"
              />
              <div>
                <Link
                  to="/founders/$slug"
                  params={{ slug: f.slug }}
                  className="font-semibold hover:text-primary"
                >
                  {f.name}
                </Link>
                <p className="text-xs text-muted-foreground">{f.pronouns}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{f.bio}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Opening hours</p>
            <p className={`mt-1 text-sm ${b.openNow ? "text-accent" : "text-muted-foreground"}`}>
              {b.openNow ? "Open now" : "Closed now"}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {b.hours.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
