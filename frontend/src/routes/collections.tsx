import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeading } from "@/components/site";
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
  const { getLaunch } = useDemo();
  const { collections, set } = useStore();
  const [name, setName] = useState("");
  return (
    <>
      <PageHeading eyebrow="Your lists" title="Collections">
        Group launches into private lists, or make them public and share a link.
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
          <div className="mt-8 space-y-4">
            {collections.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.launchSlugs.length} launches · {c.isPublic ? "Public" : "Private"}
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
                      Public
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
                            void sharePage(`/c/${encodeURIComponent(c.id)}`, c.name);
                          }}
                          className="rounded-full border border-border px-3 py-1.5"
                        >
                          Copy link
                        </Button>
                      </>
                    )}
                    <ConfirmAction
                      title="Delete collection?"
                      description="This removes the collection and its preview share link."
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
