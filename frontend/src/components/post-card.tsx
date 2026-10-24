import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, MessageCircle, Bookmark, Send, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, StageBadge } from "@/components/site";
import { Gallery } from "@/components/discovery-ui";
import { FollowButton } from "@/components/reviews";
import { CommentSection } from "@/components/comments";
import { useDemo, useStore } from "@/lib/store";
import { displayedComments } from "@/lib/activity";
import { formatDate } from "@/lib/validation";
import { sharePage } from "@/lib/share";
import type { Launch } from "@/lib/demo";
import { toast } from "sonner";
export function PostCard({
  launch,
  commentsOpen = false,
}: {
  launch: Launch;
  commentsOpen?: boolean;
}) {
  const { getBusiness } = useDemo();
  const { user, likes, savedPosts, ownLaunches, toggle, comments } = useStore();
  const [open, setOpen] = useState(commentsOpen);
  const [expanded, setExpanded] = useState(false);
  const b = getBusiness(launch.businessSlug);
  if (!b) return null;
  const own = ownLaunches.find((l) => l.id === launch.slug);
  const media = own?.images.length ? own.images : b.cover ? [{ url: b.cover, alt: b.name }] : [];
  const caption = `${launch.summary} ${b.description}`;
  const liked = likes.includes(launch.slug);
  const saved = savedPosts.includes(launch.slug);
  const count = displayedComments(launch.slug, comments).length;
  const gate = (fn: () => void) => {
    if (!user) return void toast("Sign in to interact with posts.");
    if (!user.verified) return void toast("Verify your preview account email first.");
    fn();
  };
  return (
    <article className="post-card" aria-label={`Post: ${launch.title}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Link
          to="/businesses/$slug"
          params={{ slug: b.slug }}
          className="flex min-w-0 items-center gap-3"
        >
          <Avatar
            photo={b.cover}
            initials={b.name.slice(0, 2)}
            className="h-9 w-9 rounded-full bg-secondary text-xs"
          />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{b.name}</h2>
            <p className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              <span>{formatDate(launch.startsAt)} IST</span>
              <span>
                · {b.city}, {b.state}
              </span>
            </p>
          </div>
        </Link>
        <FollowButton id={`business:${b.slug}`} />
      </div>
      <div className="px-3">
        <Gallery images={media} label={launch.title} aspect="aspect-[16/10]" />
      </div>
      <div className="px-4 pb-3 pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link
            to="/launches/$slug"
            params={{ slug: launch.slug }}
            className="text-base font-semibold hover:text-primary"
          >
            {launch.title}
          </Link>
          <StageBadge stage={launch.stage} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {expanded || caption.length < 180 ? caption : caption.slice(0, 180) + "…"}
          {caption.length >= 180 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((e) => !e)}
              className="h-auto px-1 py-0 text-xs text-foreground"
            >
              {expanded ? "Show less" : "Read more"}
            </Button>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/businesses"
            search={{ category: b.category }}
            className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground"
          >
            #{b.category.replace(/\s+/g, "")}
          </Link>
          <Link
            to="/businesses"
            search={{ city: b.city }}
            className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground"
          >
            #{b.city}
          </Link>
          <span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
            Sample launch · Browser interactions
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            title="Like post"
            aria-label={`Like ${launch.title}`}
            aria-pressed={liked}
            onClick={() => gate(() => toggle("likes", launch.slug))}
            className={`gap-1.5 px-1 ${liked ? "text-primary" : ""}`}
          >
            <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
            <span className="text-xs">{liked ? 1 : 0}</span>
          </Button>
          <Button
            variant="ghost"
            title="Comments"
            aria-label={`Comments on ${launch.title}, ${count} comments`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="gap-1.5 px-2"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs">{count}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Share post"
            aria-label={`Share ${launch.title}`}
            onClick={() => void sharePage(`/launches/${launch.slug}`, launch.title, true)}
          >
            <Send className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Save post"
            aria-label={`Save post ${launch.title}`}
            aria-pressed={saved}
            onClick={() => gate(() => toggle("savedPosts", launch.slug))}
            className={`ml-auto ${saved ? "text-primary" : ""}`}
          >
            <Bookmark className={`h-5 w-5 ${saved ? "fill-current" : ""}`} />
          </Button>
        </div>
      </div>
      {open ? (
        <CommentSection launchSlug={launch.slug} compact ownerSlug={b.founderSlug} />
      ) : (
        <Button
          variant="ghost"
          onClick={() => setOpen(true)}
          className="h-auto w-full justify-start rounded-none border-t border-border px-4 py-3 text-xs text-muted-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          View comments or join the conversation
        </Button>
      )}
    </article>
  );
}
