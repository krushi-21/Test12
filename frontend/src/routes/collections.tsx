import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Avatar, PageHeading } from "@/components/site";
import { btnPrimary, inputCls, SignedIn } from "@/components/bits";
import { useDemo } from "@/lib/store";
import { sharePage } from "@/lib/share";
import { ConfirmAction } from "@/components/actions";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/collections")({
  head: () => seo("Collections", "Your private and public lists of launches.", true),
  component: Collections,
});

function Collections() {
  const { getLaunch, getBusiness } = useDemo();
  const { collections, set, savedCollections, toggle, user } = useStore();
  const [name, setName] = useState("");
  return (
    <>
      <PageHeading eyebrow="Your lists" title="Collections">
        Group launches into lists. Preview links are only available in this browser.
      </PageHeading>
      <div className="mx-auto max-w-4xl px-4">
        <SignedIn what="create collections" needVerified>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              set((s) => ({
                ...s,
                collections: [
                  ...s.collections,
                  {
                    id: `${name.toLowerCase().replace(/\W+/g, "-")}-${Date.now().toString(36)}`,
                    name,
                    isPublic: false,
                    launchSlugs: [],
                  },
                ],
              }));
              setName("");
            }}
          >
            <input
              aria-label="New collection name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New collection name"
              className={`${inputCls} flex-1`}
            />
            <Button variant="ghost" className={btnPrimary}>
              Create
            </Button>
          </form>
          {collections.length === 0 && (
            <p role="status" className="mt-6 text-muted-foreground">
              No collections yet. Create your first collection above.
            </p>
          )}
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {collections.map((c) => (
              <div
                key={c.id}
                className="overflow-hidden rounded-lg border border-border bg-card p-4"
              >
                {getBusiness(getLaunch(c.launchSlugs[0] ?? "")?.businessSlug ?? "")?.cover && (
                  <Avatar
                    photo={
                      getBusiness(getLaunch(c.launchSlugs[0] ?? "")?.businessSlug ?? "")?.cover
                    }
                    initials="N"
                    className="mb-4 aspect-[16/9] w-full rounded-lg bg-muted"
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Save collection ${c.name}`}
                  aria-pressed={savedCollections.includes(c.id)}
                  onClick={() => toggle("savedCollections", c.id)}
                  className="mb-3 text-xs text-primary"
                >
                  {savedCollections.includes(c.id) ? "Collection saved" : "Save collection"}
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.launchSlugs.length} launches ·{" "}
                      {c.isPublic ? "Preview link enabled" : "Private"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={c.isPublic}
                        onChange={(e) =>
                          set((s) => ({
                            ...s,
                            collections: s.collections.map((x) =>
                              x.id === c.id ? { ...x, isPublic: e.target.checked } : x,
                            ),
                          }))
                        }
                      />
                      Enable preview link
                    </label>
                    {c.isPublic && (
                      <>
                        <Link
                          to="/c/$id"
                          params={{ id: c.id }}
                          className="rounded-full border border-border px-3 py-1.5"
                        >
                          Open
                        </Link>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            void sharePage(`/c/${encodeURIComponent(c.id)}`, c.name, false, true);
                          }}
                          className="rounded-full border border-border px-3 py-1.5"
                        >
                          Copy preview link
                        </Button>
                      </>
                    )}
                    <ConfirmAction
                      title="Delete collection?"
                      description="This removes the collection and its browser-only preview link."
                      onConfirm={() =>
                        set((s) => ({
                          ...s,
                          collections: s.collections.filter((x) => x.id !== c.id),
                        }))
                      }
                      className="text-destructive"
                    >
                      Delete
                    </ConfirmAction>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs text-muted-foreground">
                    Collection name
                    <input
                      aria-label={`Rename ${c.name}`}
                      value={c.name}
                      maxLength={100}
                      onChange={(e) =>
                        set((s) => ({
                          ...s,
                          collections: s.collections.map((x) =>
                            x.id === c.id ? { ...x, name: e.target.value } : x,
                          ),
                        }))
                      }
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                </div>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {c.launchSlugs.map((sl) => (
                    <li key={sl}>
                      <Link
                        to="/launches/$slug"
                        params={{ slug: sl }}
                        className="rounded-full bg-secondary px-3 py-1 text-sm"
                      >
                        {getLaunch(sl)?.title ?? "Unavailable launch"}
                      </Link>
                      <Button
                        variant="ghost"
                        aria-label={`Remove ${getLaunch(sl)?.title ?? sl}`}
                        onClick={() =>
                          set((s) => ({
                            ...s,
                            collections: s.collections.map((x) =>
                              x.id === c.id
                                ? { ...x, launchSlugs: x.launchSlugs.filter((slug) => slug !== sl) }
                                : x,
                            ),
                          }))
                        }
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                  {c.launchSlugs.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Add launches from any launch page.
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </SignedIn>
      </div>
    </>
  );
}
