import { Heart, Send, CornerDownRight, Flag } from "lucide-react";
import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/actions";
import { Avatar } from "@/components/site";
import { formatDate } from "@/lib/validation";
import { displayedComments } from "@/lib/activity";
import {
  COMMENT_LIMIT,
  MAX_REPLY_DEPTH,
  validateComment,
  removeCommentThread,
  canReplyTo,
} from "@/lib/discovery";
import { useStore, useDemo, type Comment } from "@/lib/store";

export function CommentSection({
  launchSlug,
  total: _total,
  compact = false,
  ownerSlug,
  businessSlug,
}: {
  launchSlug: string;
  total?: number;
  compact?: boolean;
  ownerSlug?: string;
  businessSlug?: string;
}) {
  const { user, comments, commentLikes, set, toggle, storageError } = useStore();
  const { getFounder, getLaunch, getBusiness } = useDemo();
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ id: string; author: string; depth: number } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [visible, setVisible] = useState(compact ? 2 : 6);
  const [pending, setPending] = useState(false);
  const [reported, setReported] = useState<string[]>([]);
  const [replyLimits, setReplyLimits] = useState<Record<string, number>>({});
  const lock = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const list = displayedComments(launchSlug, comments);
  const owner =
    ownerSlug ??
    getBusiness(getLaunch(launchSlug)?.businessSlug ?? businessSlug ?? "")?.founderSlug;
  const founder = user?.founderSlug ? getFounder(user.founderSlug) : undefined;
  const roots = list
    .filter((c) => !c.parentId || !list.some((p) => p.id === c.parentId))
    .sort((a, b) =>
      sort === "relevant"
        ? Number(commentLikes.includes(`${launchSlug}:${b.id}`)) -
            Number(commentLikes.includes(`${launchSlug}:${a.id}`)) || b.at.localeCompare(a.at)
        : b.at.localeCompare(a.at),
    );
  const gate = (fn: () => void) => {
    if (!user) {
      setError("Sign in to join the conversation.");
      return;
    }
    if (!user.verified) {
      setError("Verify your account email first.");
      return;
    }
    setError("");
    fn();
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const issue = validateComment(text);
    if (issue) {
      setError(issue);
      return;
    }
    if (!user?.verified) {
      setError("Sign in with a verified preview email to comment.");
      return;
    }
    if (reply && !canReplyTo(list, reply.id)) {
      setReply(null);
      setError("This reply target was removed or reached the reply limit. Choose another comment.");
      return;
    }
    lock.current = true;
    setPending(true);
    setError("");
    try {
      await Promise.resolve();
      const comment: Comment = {
        id: crypto.randomUUID(),
        launchSlug,
        author: user.name,
        authorEmail: user.email,
        text: text.trim(),
        at: new Date().toISOString(),
        ...(user.founderSlug ? { founderSlug: user.founderSlug } : {}),
        ...(reply ? { parentId: reply.id } : {}),
      };
      set((s) => ({ ...s, comments: [comment, ...s.comments] }));
      setText("");
      setReply(null);
      setVisible((v) => Math.max(v, 6));
      setStatus("Comment added to this browser preview.");
    } catch {
      setError("Could not add your comment. Try again.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function renderComment(c: (typeof list)[number], depth = 0): React.ReactNode {
    const own =
      !c.sample && (c.authorEmail ? c.authorEmail === user?.email : c.author === user?.name);
    const author = c.founderSlug ? getFounder(c.founderSlug) : undefined;
    const on = commentLikes.includes(`${launchSlug}:${c.id}`);
    const children = list.filter((r) => r.parentId === c.id);
    const replyLimit = replyLimits[c.id] ?? (compact ? 2 : 4);
    return (
      <li key={c.id} className="py-3">
        <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
          <Avatar
            photo={author?.photo}
            initials={c.author.slice(0, 2)}
            className="h-8 w-8 rounded-full bg-secondary text-xs"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-semibold">{c.author}</span>
              <span className="text-[10px] text-muted-foreground">{formatDate(c.at)} IST</span>
              {c.sample ? (
                <span className="text-[10px] text-muted-foreground">Sample</span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Preview</span>
              )}
              {owner && c.founderSlug === owner && (
                <span className="rounded bg-secondary px-1.5 text-[10px] text-primary">Author</span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{c.text}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                title="Like comment"
                aria-label={`Like comment by ${c.author}`}
                aria-pressed={on}
                onClick={() => gate(() => toggle("commentLikes", `${launchSlug}:${c.id}`))}
                className={`h-7 gap-1 px-1 text-xs ${on ? "text-primary" : "text-muted-foreground"}`}
              >
                <Heart aria-hidden className={`h-3 w-3 ${on ? "fill-current" : ""}`} />
                {on ? 1 : 0}
              </Button>
              {depth < MAX_REPLY_DEPTH && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    gate(() => {
                      setReply({ id: c.id, author: c.author, depth });
                      input.current?.focus();
                    })
                  }
                  className="h-7 px-1 text-xs text-muted-foreground"
                >
                  Reply
                </Button>
              )}
              {own ? (
                <ConfirmAction
                  title="Delete comment?"
                  description="This also removes its replies from this browser preview."
                  onConfirm={() => {
                    set((s) => ({ ...s, comments: removeCommentThread(s.comments, c.id) }));
                    setStatus("Comment removed from this browser.");
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Delete
                </ConfirmAction>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Report comment"
                  aria-label={`Report comment by ${c.author}`}
                  disabled={reported.includes(c.id)}
                  onClick={() =>
                    gate(() => {
                      setReported((r) => [...r, c.id]);
                      setStatus("Report marked locally; no moderation request was sent.");
                    })
                  }
                  className="ml-auto h-7 w-7 text-muted-foreground"
                >
                  <Flag className="h-3 w-3" />
                </Button>
              )}
            </div>
            {children.length > 0 && (
              <ul className="mt-1 border-l border-border pl-3">
                {children.slice(0, replyLimit).map((r) => renderComment(r, depth + 1))}
                {children.length > replyLimit && (
                  <li>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReplyLimits((l) => ({ ...l, [c.id]: replyLimit + 4 }))}
                      className="text-xs text-primary"
                    >
                      Load more replies
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </li>
    );
  }
  return (
    <section
      className={compact ? "border-t border-border px-4 py-4" : "mt-4"}
      aria-label="Comment thread"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Comments ({list.length})</h2>
        <select
          aria-label="Sort comments"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded bg-transparent px-2 py-1 text-xs"
        >
          <option value="newest">Newest</option>
          <option value="relevant">Liked by you</option>
        </select>
      </div>
      <p className="mb-3 text-[10px] text-muted-foreground">
        {list.filter((c) => c.sample).length} sample comments ·{" "}
        {list.filter((c) => !c.sample).length} browser comments and replies
      </p>
      {!user ? (
        <p className="mb-4 text-sm text-muted-foreground">
          <Link to="/signin" className="text-primary">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      ) : !user.verified ? (
        <p className="mb-4 text-sm">
          <Link to="/verify-email" className="text-primary">
            Verify your email
          </Link>{" "}
          to comment.
        </p>
      ) : (
        <form onSubmit={submit} className="mb-4">
          {reply && (
            <div className="mb-2 flex items-center gap-2 text-xs text-primary">
              <CornerDownRight className="h-3 w-3" />
              Replying to {reply.author}
              <Button variant="ghost" size="sm" type="button" onClick={() => setReply(null)}>
                Cancel
              </Button>
            </div>
          )}
          <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-2">
            <Avatar
              photo={founder?.photo}
              initials={user.name.slice(0, 2)}
              className="mt-1 h-8 w-8 rounded-full bg-secondary text-xs"
            />
            <textarea
              ref={input}
              aria-label={reply ? "Your reply" : "Your comment"}
              maxLength={COMMENT_LIMIT}
              rows={compact ? 1 : 2}
              value={text}
              disabled={pending}
              onChange={(e) => {
                setText(e.target.value);
                setStatus("");
              }}
              placeholder={reply ? "Write a reply…" : "Add a comment…"}
              className="min-h-10 w-full resize-y rounded-lg border border-input bg-muted px-3 py-2.5 text-sm focus:border-primary"
            />
            <Button
              type="submit"
              disabled={pending || !text.trim()}
              aria-label={reply ? "Post reply" : "Post comment"}
              className="h-10 gap-1 px-3"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:block">{pending ? "Adding…" : "Post"}</span>
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mb-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {(status || storageError) && (
        <p role={storageError ? "alert" : "status"} className="mb-3 text-xs text-muted-foreground">
          {storageError || status}
        </p>
      )}
      {!list.length && (
        <p className="py-4 text-sm text-muted-foreground">
          No comments yet. Start the conversation.
        </p>
      )}
      <ul>{roots.slice(0, visible).map((c) => renderComment(c))}</ul>
      {roots.length > visible && (
        <Button
          variant="ghost"
          onClick={() => setVisible((v) => v + 6)}
          className="mt-3 text-xs text-primary"
        >
          Load more comments
        </Button>
      )}
      {compact && (
        <Link
          to="/launches/$slug"
          params={{ slug: launchSlug }}
          search={{ tab: "Comments" }}
          className="mt-3 inline-block text-xs text-primary"
        >
          Open complete thread →
        </Link>
      )}
    </section>
  );
}
