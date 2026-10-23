import { useDemo } from "@/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeading } from "@/components/site";
import { cityCentres, coords } from "@/lib/demo";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/map")({
  head: () =>
    seo("Map", "See Naviraa businesses on a map of India using owner-supplied locations."),
  component: MapView,
});

// India bounding box for a simple projected map.
const B = { minLat: 6, maxLat: 36, minLng: 68, maxLng: 98 };
const project = (
  [lat, lng]: [number, number],
  zoom: { c: [number, number]; span: number } | null,
) => {
  const box = zoom
    ? {
        minLat: zoom.c[0] - zoom.span,
        maxLat: zoom.c[0] + zoom.span,
        minLng: zoom.c[1] - zoom.span,
        maxLng: zoom.c[1] + zoom.span,
      }
    : B;
  return {
    x: ((lng - box.minLng) / (box.maxLng - box.minLng)) * 100,
    y: ((box.maxLat - lat) / (box.maxLat - box.minLat)) * 100,
  };
};

function MapView() {
  const { businesses } = useDemo();
  const [city, setCity] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const centre = cityCentres[city];
  const zoom = centre ? { c: centre, span: 1.5 } : null;
  const locations: Record<string, [number, number]> = { ...coords };
  businesses.forEach((b) => {
    if (b.latitude !== undefined && b.longitude !== undefined)
      locations[b.slug] = [b.latitude, b.longitude];
  });
  const shown = businesses
    .filter((b) => (!city || b.city === city) && b.mode !== "online")
    .filter((b) => locations[b.slug]);
  const sel = businesses.find((b) => b.slug === active);

  return (
    <>
      <PageHeading eyebrow="Map" title="Businesses near a city">
        Locations come from business owners. We never ask for your device location.
      </PageHeading>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-[1fr_320px]">
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-secondary md:aspect-[4/3]">
          <svg className="absolute inset-0 h-full w-full text-border" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <line
                key={`h${i}`}
                x1="0"
                x2="100%"
                y1={`${i * 10}%`}
                y2={`${i * 10}%`}
                stroke="currentColor"
              />
            ))}
            {Array.from({ length: 10 }, (_, i) => (
              <line
                key={`v${i}`}
                y1="0"
                y2="100%"
                x1={`${i * 10}%`}
                x2={`${i * 10}%`}
                stroke="currentColor"
              />
            ))}
          </svg>
          {Object.entries(cityCentres).map(([name, c]) => {
            const p = project(c, zoom);
            if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
            return (
              <span
                key={name}
                className="absolute -translate-x-1/2 translate-y-3 text-xs text-muted-foreground"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                {name}
              </span>
            );
          })}
          {shown.map((b) => {
            const coordinates = locations[b.slug];
            if (!coordinates) return null;
            const p = project(coordinates, zoom);
            if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
            return (
              <button
                key={b.slug}
                onClick={() => setActive(b.slug)}
                aria-label={b.name}
                className={`absolute -translate-x-1/2 -translate-y-full rounded-t-full px-2 pb-1 pt-2 text-xs font-semibold shadow-md transition ${active === b.slug ? "bg-foreground text-background" : "bg-primary text-primary-foreground hover:scale-110"}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              >
                ★
              </button>
            );
          })}
        </div>
        <aside className="space-y-4">
          <select
            aria-label="Map city"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setActive(null);
            }}
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm"
          >
            <option value="">All of India</option>
            {Object.keys(cityCentres).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {sel ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-display text-xl font-semibold">{sel.name}</p>
              <p className="text-sm text-muted-foreground">
                {sel.area}, {sel.city}
              </p>
              <p className="mt-2 text-sm">{sel.tagline}</p>
              <Link
                to="/businesses/$slug"
                params={{ slug: sel.slug }}
                className="mt-4 inline-block text-sm font-medium text-primary"
              >
                View profile →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tap a marker to see the business.</p>
          )}
          {shown.length === 0 && <p>No mapped businesses in this city.</p>}
          <ul className="space-y-2">
            {shown.map((b) => (
              <li key={b.slug}>
                <button
                  onClick={() => setActive(b.slug)}
                  className="w-full rounded-xl bg-card px-4 py-3 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{b.name}</span>{" "}
                  <span className="text-muted-foreground">· {b.city}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
