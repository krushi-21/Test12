import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Clock, Heart, Rocket, ShieldCheck, UserPlus } from "lucide-react";
import { PageHeading } from "@/components/site";
import { btnOutline, SignedIn } from "@/components/bits";
import { useStore, type Notice } from "@/lib/store";
import { formatDate } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/notifications")({
  head: () => seo("Notifications", "Launch, follow, engagement and verification updates.", true),
  component: Notifications,
});

const icons: Record<Notice["kind"], typeof Bell> = {
  launch: Rocket,
  follow: UserPlus,
  engagement: Heart,
  verification: ShieldCheck,
  ending: Clock,
};

function Notifications() {
  const { notifications, set } = useStore();
  return (
    <>
      <PageHeading eyebrow="Inbox" title="Notifications" />
      <div className="mx-auto max-w-3xl px-4">
        <SignedIn what="see notifications">
          <div className="mb-4 flex justify-end">
            <Button
              variant="ghost"
              disabled={notifications.every((n) => n.read)}
              onClick={() =>
                set((s) => ({
                  ...s,
                  notifications: s.notifications.map((n) => ({ ...n, read: true })),
                }))
              }
              className={btnOutline}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          </div>
          <ul className="space-y-2">
            {notifications.map((n) => {
              const Icon = icons[n.kind];
              return (
                <li key={n.id}>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      set((s) => ({
                        ...s,
                        notifications: s.notifications.map((x) =>
                          x.id === n.id ? { ...x, read: true } : x,
                        ),
                      }))
                    }
                    className={`flex h-auto w-full items-center gap-4 whitespace-normal rounded-2xl border p-4 text-left ${n.read ? "border-border bg-card" : "border-primary bg-secondary"}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{n.text}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(n.at) + " IST"}
                      </span>
                    </span>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </Button>
                  {n.launchSlug && (
                    <Link
                      to="/launches/$slug"
                      params={{ slug: n.launchSlug }}
                      className="ml-4 inline-block py-2 text-sm text-primary"
                    >
                      View launch →
                    </Link>
                  )}
                  {n.businessSlug && (
                    <Link
                      to="/businesses/$slug"
                      params={{ slug: n.businessSlug }}
                      className="ml-4 inline-block py-2 text-sm text-primary"
                    >
                      View business →
                    </Link>
                  )}
                </li>
              );
            })}
            {notifications.length === 0 && (
              <p className="text-muted-foreground">You're all caught up.</p>
            )}
          </ul>
        </SignedIn>
      </div>
    </>
  );
}
