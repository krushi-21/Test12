import { Link } from "@tanstack/react-router";
import { displayedReviews, reviewAverage } from "@/lib/activity";
import { Flag } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { btnPrimary, inputCls } from "@/components/bits";
import { type Business } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { canReview } from "@/lib/validation";

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange?: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            variant="ghost"
            size="icon"
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(n)}
            aria-label={`${label} ${n} stars`}
            aria-pressed={n === value}
            className={`h-10 w-10 text-xl ${n <= value ? "text-primary" : "text-muted-foreground"}`}
          >
            ★
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ReviewSection({ business }: { business: Business }) {
  const { user, reviews, set } = useStore();
  const mine = reviews.find((r) => r.businessSlug === business.slug);
  const isOwner = user?.founderSlug === business.founderSlug;
  const [f, setF] = useState(
    mine ?? { overall: 0, quality: 0, value: 0, experience: 0, recommend: true, text: "" },
  );
  const [reported, setReported] = useState<string[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canReview(user, business.founderSlug)) return;
    if (!f.overall || !f.quality || !f.value || !f.experience)
      return void toast.error("Please rate every category.");
    set((s) => ({
      ...s,
      reviews: [
        ...s.reviews.filter((r) => r.businessSlug !== business.slug),
        { businessSlug: business.slug, ...f },
      ],
    }));
    toast.success("Thanks for your review");
  };

  const all = displayedReviews(business.slug, reviews);
  const average = reviewAverage(all);

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-muted-foreground">
        {average === null
          ? "No reviews yet."
          : `${average.toFixed(1)} / 5 · ${all.length} preview reviews`}
      </p>
      <ul className="space-y-3">
        {all.map((r) => (
          <li
            key={r.id}
            className={`rounded-2xl border border-border p-5 ${r.sample ? "bg-muted" : "bg-card"}`}
          >
            <div className="flex items-center justify-between">
              <span aria-label={`${r.overall} out of 5 stars`} className="text-primary">
                {"★".repeat(r.overall)}
                <span className="text-border">{"★".repeat(5 - r.overall)}</span>
              </span>
              {r.id !== "mine" && (
                <Button
                  variant="ghost"
                  disabled={reported.includes(r.id)}
                  onClick={() => {
                    if (!user) return void toast("Sign in to report");
                    setReported([...reported, r.id]);
                    toast("Report marked in this preview. No moderation request has been sent.");
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Flag className="h-3 w-3" />
                  {reported.includes(r.id) ? "Reported" : "Report"}
                </Button>
              )}
            </div>
            <p className="mt-2 text-sm">{r.text || "No written comment."}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {r.sample ? "Sample" : "Your browser preview review"}
              {r.recommend ? " · Recommends" : ""}
            </p>
          </li>
        ))}
      </ul>

      {!user ? (
        <p className="text-sm text-muted-foreground">
          Sign in with a verified email to leave a review.
        </p>
      ) : isOwner ? (
        <p className="text-sm text-muted-foreground">You can't review your own business.</p>
      ) : !user.verified ? (
        <p className="text-sm text-muted-foreground">Verify your email to leave a review.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <p className="font-display text-lg font-semibold">
            {mine ? "Edit your review" : "Write a review"}
          </p>
          <Stars label="Overall" value={f.overall} onChange={(n) => setF({ ...f, overall: n })} />
          <Stars label="Quality" value={f.quality} onChange={(n) => setF({ ...f, quality: n })} />
          <Stars label="Value" value={f.value} onChange={(n) => setF({ ...f, value: n })} />
          <Stars
            label="Experience"
            value={f.experience}
            onChange={(n) => setF({ ...f, experience: n })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={f.recommend}
              onChange={(e) => setF({ ...f, recommend: e.target.checked })}
            />
            I'd recommend this business
          </label>
          <textarea
            aria-label="Review text"
            maxLength={2000}
            rows={3}
            value={f.text}
            onChange={(e) => setF({ ...f, text: e.target.value })}
            placeholder="Share your experience (optional)"
            className={inputCls}
          />
          <Button variant="ghost" className={btnPrimary}>
            {mine ? "Update review" : "Submit review"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function FollowButton({ id }: { id: string }) {
  const { user, follows, toggle } = useStore();
  if (!user)
    return (
      <Link
        to="/signin"
        className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary"
      >
        Sign in to follow
      </Link>
    );
  if (!user.verified)
    return (
      <Link
        to="/verify-email"
        className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary"
      >
        Verify email to follow
      </Link>
    );
  const on = follows.includes(id);
  return (
    <Button
      variant="ghost"
      aria-pressed={on}
      onClick={() => {
        if (!user.verified) return void toast("Verify your email to follow");
        toggle("follows", id);
      }}
      className={`rounded-lg px-3 py-2 text-xs font-medium ${on ? "bg-secondary text-primary" : "border border-border text-primary"}`}
    >
      {on ? "Following" : "Follow"}
    </Button>
  );
}
