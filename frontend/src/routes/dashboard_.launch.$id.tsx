import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ImagePlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/site";
import { btnOutline, btnPrimary, Field, inputCls, Panel, SignedIn } from "@/components/bits";
import { useDemo } from "@/lib/store";
import { readPreviewImage } from "@/lib/media";
import { validateSchedule, canManage } from "@/lib/validation";
import { useUnsaved } from "@/hooks/use-unsaved";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useStore, type OwnLaunch } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/dashboard_/launch/$id")({
  head: () => seo("Launch editor", "Create or edit a launch.", true),
  component: () => (
    <>
      <PageHeading eyebrow="Founder workspace" title="Launch editor" />
      <div className="mx-auto max-w-4xl px-4">
        <SignedIn what="create launches">
          <Editor />
        </SignedIn>
      </div>
    </>
  ),
});

function Editor() {
  const { id } = Route.useParams();
  const { ownLaunches, set, user } = useStore();
  const navigate = useNavigate();
  const { businesses } = useDemo();
  const existing = ownLaunches.find((l) => l.id === id);
  const mine = businesses.filter((b) => canManage(user?.founderSlug, b.founderSlug));
  const [f, setF] = useState<OwnLaunch>(
    existing ?? {
      id: `l-${Date.now().toString(36)}`,
      title: "",
      summary: "",
      businessSlug: mine[0]?.slug ?? "",
      startsAt: "",
      status: "draft",
      images: [],
    },
  );
  const [errors, setErrors] = useState<
    Partial<Record<"title" | "summary" | "startsAt" | "endsAt" | "images", string>>
  >({});

  const [baseline, setBaseline] = useState(JSON.stringify(f));
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const allowNavigation = useUnsaved(JSON.stringify(f) !== baseline);
  if (
    !user?.founderSlug ||
    (id !== "new" && (!existing || !mine.some((b) => b.slug === existing.businessSlug)))
  )
    return <p role="alert">This launch is unavailable or does not belong to your profile.</p>;
  if (!mine.length)
    return (
      <p>
        Create your business first.{" "}
        <Link to="/dashboard/business/$slug" params={{ slug: "new" }} className="text-primary">
          Add business
        </Link>
      </p>
    );
  const save = (publish: boolean) => {
    const e: Partial<Record<"title" | "summary" | "startsAt" | "endsAt" | "images", string>> = {};
    if (f.title.trim().length < 3) e.title = "Add a title (3+ characters).";
    if (f.summary.trim().length < 10) e.summary = "Add a short summary (10+ characters).";
    const scheduleError = validateSchedule(f.startsAt, f.endsAt);
    if (scheduleError) e.startsAt = scheduleError;
    if (!mine.some((b) => b.slug === f.businessSlug))
      e.title = "Choose one of your own businesses.";
    if (f.images.some((i) => !i.alt.trim())) e.images = "Every image needs alt text.";
    setErrors(e);
    if (Object.keys(e).length) return;
    if (publish && !user?.verified) return void toast.error("Verify your email to publish.");
    const next = { ...f, status: publish ? "published" : "draft" } as OwnLaunch;
    set((s) => ({
      ...s,
      ownLaunches: existing
        ? s.ownLaunches.map((l) => (l.id === f.id ? next : l))
        : [...s.ownLaunches, next],
    }));
    allowNavigation();
    setBaseline(JSON.stringify(f));
    toast.success(publish ? "Launch published" : "Draft saved");
    navigate({ to: "/dashboard", ignoreBlocker: true });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    if (files.length + f.images.length > 6) {
      toast.error("A launch can have up to 6 images.");
      return;
    }
    setUploading(true);
    try {
      const images = await Promise.all(
        Array.from(files).map(async (file) => ({ url: await readPreviewImage(file), alt: "" })),
      );
      setF((current) => ({ ...current, images: [...current.images, ...images] }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel title="Basics">
        <div className="space-y-4">
          <Field label="Business">
            <select
              value={f.businessSlug}
              onChange={(e) => setF({ ...f, businessSlug: e.target.value })}
              className={inputCls}
            >
              {mine.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Launch title">
            <input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              className={inputCls}
            />
          </Field>
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
          <Field label="Summary">
            <textarea
              rows={4}
              value={f.summary}
              onChange={(e) => setF({ ...f, summary: e.target.value })}
              className={inputCls}
            />
          </Field>
          {errors.summary && <p className="text-sm text-destructive">{errors.summary}</p>}
        </div>
      </Panel>
      <Panel title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts (IST / Asia/Kolkata)">
            <input
              type="datetime-local"
              value={f.startsAt}
              onChange={(e) => setF({ ...f, startsAt: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Ends (optional, IST)">
            <input
              type="datetime-local"
              value={f.endsAt ?? ""}
              onChange={(e) =>
                setF({
                  ...f,
                  ...(e.target.value ? { endsAt: e.target.value } : { endsAt: undefined }),
                } as OwnLaunch)
              }
              className={inputCls}
            />
          </Field>
        </div>
        {(errors.startsAt || errors.endsAt) && (
          <p className="mt-2 text-sm text-destructive">{errors.startsAt ?? errors.endsAt}</p>
        )}
      </Panel>
      <Panel
        title="Images"
        action={<span className="text-xs text-muted-foreground">{f.images.length}/6</span>}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {f.images.map((img, i) => (
            <div key={img.url} className="space-y-2">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
                <Button
                  variant="ghost"
                  aria-label="Remove image"
                  onClick={() => setF({ ...f, images: f.images.filter((_, j) => j !== i) })}
                  className="absolute right-2 top-2 rounded-full bg-background p-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <input
                aria-label={`Image ${i + 1} description`}
                placeholder="Alt text (required)"
                value={img.alt}
                onChange={(e) =>
                  setF({
                    ...f,
                    images: f.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)),
                  })
                }
                className={inputCls}
              />
            </div>
          ))}
          {f.images.length < 6 && (
            <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary">
              <ImagePlus className="h-6 w-6" />
              Upload images
              <input
                aria-label="Upload launch images"
                disabled={uploading}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
          )}
        </div>
        {errors.images && <p className="mt-2 text-sm text-destructive">{errors.images}</p>}
      </Panel>
      {uploading && <p role="status">Preparing images…</p>}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>{f.title || "Untitled launch"}</DialogTitle>
          <DialogDescription>{f.summary || "No summary yet."}</DialogDescription>
          <p className="text-sm">Starts {f.startsAt || "not set"} IST</p>
          {f.images.map((img) => (
            <img
              key={img.url}
              src={img.url}
              alt={img.alt}
              className="aspect-video w-full rounded-lg object-cover"
            />
          ))}
          <Button disabled={uploading} onClick={() => save(true)}>
            Confirm publish
          </Button>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap justify-end gap-3">
        <Link to="/dashboard" className={btnOutline}>
          Cancel
        </Link>
        <Button
          variant="ghost"
          disabled={uploading}
          onClick={() => save(false)}
          className={btnOutline}
        >
          Save draft
        </Button>
        <Button
          variant="ghost"
          disabled={uploading}
          onClick={() => setPreview(true)}
          className={btnPrimary}
        >
          Preview & publish
        </Button>
      </div>
    </div>
  );
}
