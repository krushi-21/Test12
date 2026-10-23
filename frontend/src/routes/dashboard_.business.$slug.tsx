import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/site";
import { btnOutline, btnPrimary, Field, inputCls, Panel, SignedIn } from "@/components/bits";
import { categories, cities, coords, type Business, type Mode, type Product } from "@/lib/demo";
import { useDemo, useStore } from "@/lib/store";
import { useUnsaved } from "@/hooks/use-unsaved";
import { ConfirmAction } from "@/components/actions";
import { Button } from "@/components/ui/button";
import { isHttps, isEmail, canManage } from "@/lib/validation";
import { seo } from "@/lib/seo";
import { readPreviewImage } from "@/lib/media";

export const Route = createFileRoute("/dashboard_/business/$slug")({
  head: () => seo("Manage business", "Edit your business profile, hours and catalog.", true),
  component: () => (
    <>
      <PageHeading eyebrow="Founder workspace" title="Business profile" />
      <div className="mx-auto max-w-4xl px-4">
        <SignedIn what="manage businesses">
          <BusinessEditor />
        </SignedIn>
      </div>
    </>
  ),
});

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function BusinessEditor() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { getBusiness } = useDemo();
  const { user, set } = useStore();
  const b = getBusiness(slug);
  const [f, setF] = useState({
    name: b?.name ?? "",
    tagline: b?.tagline ?? "",
    description: b?.description ?? "",
    category: b?.category ?? categories[0] ?? "Crafts",
    city: b?.city ?? cities[0] ?? "Kochi",
    area: b?.area ?? "",
    mode: (b?.mode ?? "hybrid") as Mode,
    website: b?.website ?? "https://",
    whatsapp: b?.whatsapp ?? "",
    phone: b?.phone ?? "",
    email: b?.email ?? "",
    lat: String(b?.latitude ?? coords[slug]?.[0] ?? ""),
    lng: String(b?.longitude ?? coords[slug]?.[1] ?? ""),
  });
  const [hours, setHours] = useState(
    days.map((d, i) => {
      const row = b?.hours[i] ?? "";
      const match = row.match(/(\d{2}:\d{2})–(\d{2}:\d{2})/);
      return {
        day: d,
        open: !row.includes("Closed") && i < 6,
        from: match?.[1] ?? "10:00",
        to: match?.[2] ?? (i >= 4 ? "20:00" : "19:00"),
      };
    }),
  );
  const [products, setProducts] = useState<Product[]>(b?.products ?? []);
  const [err, setErr] = useState("");
  const [cover, setCover] = useState(b?.cover ?? "");
  const [uploading, setUploading] = useState(false);

  const [baseline, setBaseline] = useState(JSON.stringify({ f, hours, products, cover }));
  const allowNavigation = useUnsaved(JSON.stringify({ f, hours, products, cover }) !== baseline);
  if (!user?.founderSlug || (slug !== "new" && (!b || !canManage(user.founderSlug, b.founderSlug))))
    return <p role="alert">This business is unavailable or does not belong to your profile.</p>;

  const ownerSlug = user.founderSlug;
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  const save = () => {
    if (!f.name.trim()) return setErr("Business name is required.");
    if (f.website && f.website !== "https://" && !isHttps(f.website))
      return setErr("Website must be an https:// link.");
    const bad = products.find((p) => !p.name.trim() || !isHttps(p.url));
    if (bad) return setErr("Each catalog item needs a name and an https:// link.");
    if (f.email && !isEmail(f.email)) return setErr("Enter a valid contact email.");
    if (f.lat && (!Number.isFinite(Number(f.lat)) || Math.abs(Number(f.lat)) > 90))
      return setErr("Latitude must be between -90 and 90.");
    if (f.lng && (!Number.isFinite(Number(f.lng)) || Math.abs(Number(f.lng)) > 180))
      return setErr("Longitude must be between -180 and 180.");
    if (hours.some((h) => h.open && (!h.from || !h.to || h.to <= h.from)))
      return setErr("Closing time must be after opening time.");
    const next: Business = {
      ...(b ?? {
        slug: `business-${crypto.randomUUID()}`,
        state: "",
        founderSlug: ownerSlug,
        verified: user.verified,
        openNow: false,
        priceRange: "₹₹",
        rating: 0,
        reviews: 0,
        likes: 0,
        saves: 0,
        launchedDaysAgo: 0,
        hue: 40,
      }),
      ...f,
      cover,
      products,
      ...(f.lat ? { latitude: Number(f.lat) } : {}),
      ...(f.lng ? { longitude: Number(f.lng) } : {}),
      hours: hours.map((h) => `${h.day} ${h.open ? `${h.from}–${h.to} IST` : "Closed"}`),
    };
    set((state) => ({
      ...state,
      businessEdits: [...state.businessEdits.filter((x) => x.slug !== next.slug), next],
    }));
    allowNavigation();
    setBaseline(JSON.stringify({ f, hours, products, cover }));
    setErr("");
    toast.success("Business saved");
    navigate({ to: "/dashboard", ignoreBlocker: true });
  };

  return (
    <div className="space-y-6">
      <Panel title="Cover image">
        {cover && (
          <img
            src={cover}
            alt="Business cover preview"
            className="mb-3 aspect-video w-full rounded-lg object-cover"
          />
        )}
        <input
          aria-label="Upload business cover"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          className={inputCls}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              setCover(await readPreviewImage(file));
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Image could not be opened.");
            } finally {
              setUploading(false);
            }
          }}
        />
        {uploading && <p role="status">Preparing cover…</p>}
        {cover && (
          <Button variant="ghost" onClick={() => setCover("")}>
            Remove cover
          </Button>
        )}
      </Panel>
      <Panel title="About">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input value={f.name} onChange={up("name")} className={inputCls} />
          </Field>
          <Field label="Tagline">
            <input value={f.tagline} onChange={up("tagline")} className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                rows={4}
                value={f.description}
                onChange={up("description")}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Category">
            <select value={f.category} onChange={up("category")} className={inputCls}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="How you operate">
            <div className="grid grid-cols-3 gap-2">
              {(["online", "physical", "hybrid"] as Mode[]).map((m) => (
                <Button
                  variant="ghost"
                  type="button"
                  key={m}
                  onClick={() => setF({ ...f, mode: m })}
                  className={`rounded-lg border px-2 py-2.5 text-sm capitalize ${f.mode === m ? "border-primary bg-secondary" : "border-border"}`}
                >
                  {m}
                </Button>
              ))}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel title="Location & contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <select value={f.city} onChange={up("city")} className={inputCls}>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Area / public address">
            <input value={f.area} onChange={up("area")} className={inputCls} />
          </Field>
          <Field label="Latitude" hint="Optional. We don't look up addresses.">
            <input value={f.lat} onChange={up("lat")} className={inputCls} inputMode="decimal" />
          </Field>
          <Field label="Longitude">
            <input value={f.lng} onChange={up("lng")} className={inputCls} inputMode="decimal" />
          </Field>
          <Field label="Website (https)">
            <input value={f.website} onChange={up("website")} className={inputCls} />
          </Field>
          <Field label="WhatsApp">
            <input value={f.whatsapp} onChange={up("whatsapp")} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={f.phone} onChange={up("phone")} className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={f.email} onChange={up("email")} className={inputCls} />
          </Field>
        </div>
      </Panel>

      <Panel title="Opening hours">
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.day} className="flex flex-wrap items-center gap-3">
              <span className="w-28 text-sm">{h.day}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={h.open}
                  onChange={(e) =>
                    setHours(hours.map((x, j) => (j === i ? { ...x, open: e.target.checked } : x)))
                  }
                />
                Open
              </label>
              {h.open ? (
                <>
                  <input
                    aria-label={`${h.day} opens`}
                    type="time"
                    value={h.from}
                    onChange={(e) =>
                      setHours(hours.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))
                    }
                    className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
                  />
                  <span className="text-muted-foreground">to</span>
                  <input
                    aria-label={`${h.day} closes`}
                    type="time"
                    value={h.to}
                    onChange={(e) =>
                      setHours(hours.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))
                    }
                    className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
                  />
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Catalog"
        action={<span className="text-xs text-muted-foreground">{products.length}/12 items</span>}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Each item links to your own website. Naviraa doesn't take orders or payments.
        </p>
        <div className="space-y-3">
          {products.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
              <input
                aria-label={`Item ${i + 1} name`}
                placeholder="Item name"
                value={p.name}
                onChange={(e) =>
                  setProducts(
                    products.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
                className={inputCls}
              />
              <input
                aria-label={`Item ${i + 1} price`}
                placeholder="Price ₹ (optional)"
                inputMode="numeric"
                value={p.priceInr ?? ""}
                onChange={(e) =>
                  setProducts(
                    products.map((x, j) =>
                      j === i
                        ? {
                            name: x.name,
                            url: x.url,
                            ...(e.target.value
                              ? { priceInr: Number(e.target.value.replace(/\D/g, "")) }
                              : {}),
                          }
                        : x,
                    ),
                  )
                }
                className={inputCls}
              />
              <input
                aria-label={`Item ${i + 1} link`}
                placeholder="https://your-site.com/item"
                value={p.url}
                onChange={(e) =>
                  setProducts(products.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                }
                className={inputCls}
              />
              <Button
                variant="ghost"
                aria-label="Remove item"
                onClick={() => setProducts(products.filter((_, j) => j !== i))}
                className="rounded-lg p-2.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          disabled={products.length >= 12}
          onClick={() => setProducts([...products, { name: "", url: "https://" }])}
          className={`${btnOutline} mt-4`}
        >
          + Add item
        </Button>
      </Panel>

      {err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        {b ? (
          <ConfirmAction
            title="Delete this business?"
            description="Its profile and launches will disappear from this browser preview."
            onConfirm={() => {
              allowNavigation();
              setBaseline(JSON.stringify({ f, hours, products }));
              set((state) => ({
                ...state,
                deletedBusinesses: [...state.deletedBusinesses, b.slug],
              }));
              navigate({ to: "/dashboard", ignoreBlocker: true });
            }}
            className="text-destructive"
          >
            Delete business
          </ConfirmAction>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <Link to="/dashboard" className={btnOutline}>
            Cancel
          </Link>
          <Button variant="ghost" disabled={uploading} onClick={save} className={btnPrimary}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
