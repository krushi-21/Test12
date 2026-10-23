import { Flag, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/actions";
import { formatDate } from "@/lib/validation";
import { btnPrimary, inputCls } from "@/components/bits";
import { useStore } from "@/lib/store";

const samples: Record<string, { id: string; author: string; text: string; at: string }[]> = {
  default: [
    {
      id: "s1",
      author: "Ananya R.",
      text: "Congratulations on the launch! Do you ship outside your city?",
      at: "2026-10-22T10:15:00Z",
    },
    {
      id: "s2",
      author: "Vikram S.",
      text: "Love seeing more makers from India here. Following!",
      at: "2026-10-22T14:40:00Z",
    },
  ],
};

export function CommentSection({
  launchSlug,
  total: _total,
}: {
  launchSlug: string;
  total: number;
}) {
  const { user, comments, set } = useStore();
  const [text, setText] = useState("");
  const [reported, setReported] = useState<string[]>([]);
  const mine = comments.filter((c) => c.launchSlug === launchSlug);
  const list = [...mine, ...(samples[launchSlug] ?? samples["default"] ?? [])];

  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
        <MessageCircle className="h-5 w-5 text-primary" /> Comments{" "}
        <span className="text-base font-normal text-muted-foreground">({list.length})</span>
      </h2>

      {!user ? (
        <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm">
          <Link to="/signin" className="text-primary underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      ) : !user.verified ? (
        <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm">
          <Link to="/verify-email" className="text-primary underline">
            Verify your email
          </Link>{" "}
          to comment.
        </p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t.length < 2) return void toast.error("Write a little more first.");
            if (t.length > 1000) return void toast.error("Keep comments under 1000 characters.");
            set((s) => ({
              ...s,
              comments: [
                {
                  id: crypto.randomUUID(),
                  launchSlug,
                  author: user.name,
                  text: t,
                  at: new Date().toISOString(),
                },
                ...s.comments,
              ],
            }));
            setText("");
          }}
        >
          <textarea
            aria-label="Your comment"
            maxLength={1000}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask a question or cheer the founder on…"
            className={inputCls}
          />
          <div className="flex justify-end">
            <Button variant="ghost" className={btnPrimary}>
              Post comment
            </Button>
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-3">
        {list.map((c) => {
          const own = mine.some((m) => m.id === c.id);
          return (
            <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                  {c.author.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{c.author}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(c.at) + " IST"}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm">{c.text}</p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    {own ? (
                      <ConfirmAction
                        title="Delete comment?"
                        description="This removes your comment from the browser preview."
                        onConfirm={() =>
                          set((s) => ({ ...s, comments: s.comments.filter((x) => x.id !== c.id) }))
                        }
                      >
                        Delete
                      </ConfirmAction>
                    ) : (
                      <Button
                        variant="ghost"
                        disabled={reported.includes(c.id)}
                        onClick={() => {
                          if (!user) return void toast("Sign in to report");
                          setReported([...reported, c.id]);
                          toast(
                            "Report marked in this preview. No moderation request has been sent.",
                          );
                        }}
                        className="flex items-center gap-1 hover:text-destructive disabled:opacity-50"
                      >
                        <Flag className="h-3 w-3" />
                        {reported.includes(c.id) ? "Reported" : "Report"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
