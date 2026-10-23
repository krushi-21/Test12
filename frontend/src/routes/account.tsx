import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeading } from "@/components/site";
import { btnPrimary, Field, inputCls, Panel, SignedIn } from "@/components/bits";
import { type Founder } from "@/lib/demo";
import { useStore, useDemo } from "@/lib/store";
import { useUnsaved } from "@/hooks/use-unsaved";
import { PasswordInput } from "@/components/actions";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";
import { readPreviewImage } from "@/lib/media";

export const Route = createFileRoute("/account")({
  head: () => seo("Your profile", "Edit your founder profile and account settings.", true),
  component: () => (
    <>
      <PageHeading eyebrow="Account" title="Your profile" />
      <div className="mx-auto max-w-3xl px-4">
        <SignedIn what="edit your profile">
          <Profile />
        </SignedIn>
      </div>
    </>
  ),
});

function Profile() {
  const { user, set } = useStore();
  const { businesses, getFounder } = useDemo();
  const founder = getFounder(user?.founderSlug ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [pronouns, setPronouns] = useState(founder?.pronouns ?? "");
  const [bio, setBio] = useState(founder?.bio ?? "");
  const [interests, setInterests] = useState<string[]>(founder?.interests ?? []);
  const [tag, setTag] = useState("");
  const mine = businesses.filter((b) => b.founderSlug === user?.founderSlug);
  const [publicBrands, setPublicBrands] = useState<string[]>(
    founder?.publicBrands ?? mine.map((b) => b.slug),
  );
  const [pw, setPw] = useState({ current: "", next: "" });
  const [photo, setPhoto] = useState(founder?.photo ?? "");
  const [uploading, setUploading] = useState(false);

  const [baseline, setBaseline] = useState(
    JSON.stringify({ name, pronouns, bio, interests, publicBrands, photo }),
  );
  const allowNavigation = useUnsaved(
    JSON.stringify({ name, pronouns, bio, interests, publicBrands, photo }) !== baseline,
  );

  return (
    <div className="space-y-6">
      <Panel
        title="Founder profile"
        action={
          founder && (
            <Link
              to="/founders/$slug"
              params={{ slug: founder.slug }}
              className="text-sm text-primary"
            >
              View public page →
            </Link>
          )
        }
      >
        <div className="space-y-4">
          {photo && (
            <img
              src={photo}
              alt="Profile photo preview"
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <Field label="Profile photo">
            <input
              aria-label="Upload profile photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              className={inputCls}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  setPhoto(await readPreviewImage(file));
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Image could not be opened.",
                  );
                } finally {
                  setUploading(false);
                }
              }}
            />
          </Field>
          {uploading && <p role="status">Preparing photo…</p>}
          {photo && (
            <Button variant="ghost" onClick={() => setPhoto("")}>
              Remove photo
            </Button>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Pronouns (optional)">
              <input
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Bio">
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Interests" hint="Up to 8, each 40 characters max">
            <div className="flex flex-wrap gap-2">
              {interests.map((i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                >
                  {i}
                  <Button
                    variant="ghost"
                    type="button"
                    aria-label={`Remove ${i}`}
                    onClick={() => setInterests(interests.filter((x) => x !== i))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ))}
              {interests.length < 8 && (
                <input
                  value={tag}
                  maxLength={40}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tag.trim()) {
                      e.preventDefault();
                      if (!interests.includes(tag.trim())) setInterests([...interests, tag.trim()]);
                      setTag("");
                    }
                  }}
                  placeholder="Type and press Enter"
                  className="rounded-full border border-input bg-card px-3 py-1 text-sm"
                />
              )}
            </div>
          </Field>
          {mine.length > 0 && (
            <Field label="Businesses shown on your public page">
              <div className="space-y-2">
                {mine.map((b) => (
                  <label key={b.slug} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={publicBrands.includes(b.slug)}
                      onChange={(e) =>
                        setPublicBrands(
                          e.target.checked
                            ? [...publicBrands, b.slug]
                            : publicBrands.filter((x) => x !== b.slug),
                        )
                      }
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Button
            variant="ghost"
            disabled={uploading}
            onClick={() => {
              if (!name.trim()) return void toast.error("Display name is required.");
              const profile: Founder = {
                ...(founder ?? {
                  slug: user?.founderSlug ?? "",
                  city: "",
                  initials: name.charAt(0),
                }),
                name,
                pronouns,
                bio,
                interests,
                publicBrands,
                photo,
              };
              set((s) => ({
                ...s,
                user: s.user ? { ...s.user, name } : s.user,
                founderEdits: [...s.founderEdits.filter((x) => x.slug !== profile.slug), profile],
              }));
              setBaseline(JSON.stringify({ name, pronouns, bio, interests, publicBrands, photo }));
              toast.success("Profile saved in this preview");
            }}
            className={btnPrimary}
          >
            Save profile
          </Button>
        </div>
      </Panel>

      <Panel title="Account">
        <p className="text-sm">
          Email: <strong>{user?.email}</strong>{" "}
          {user?.verified ? (
            <span className="text-accent">· verified</span>
          ) : (
            <Link to="/verify-email" className="text-primary">
              · verify now
            </Link>
          )}
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pw.current || pw.next.length < 8)
              return void toast.error(
                "Enter your current password and a new one of 8+ characters.",
              );
            setPw({ current: "", next: "" });
            toast("Password form checked. Real password changes are not connected yet.");
          }}
        >
          <Field label="Current password">
            <PasswordInput
              aria-label="Current password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="New password">
            <PasswordInput
              aria-label="New password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              className={inputCls}
            />
          </Field>
          <div>
            <Button variant="ghost" className={btnPrimary}>
              Change password
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Your lists">
        <div className="flex gap-3 text-sm">
          <Link to="/saved" className="text-primary">
            Saved items →
          </Link>
          <Link to="/collections" className="text-primary">
            Collections →
          </Link>
          <Link to="/notifications" className="text-primary">
            Notifications →
          </Link>
        </div>
      </Panel>
    </div>
  );
}
