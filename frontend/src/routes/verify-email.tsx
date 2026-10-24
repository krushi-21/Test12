import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard, btnOutline, btnPrimary, Field, inputCls } from "@/components/bits";
import { useStore } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/verify-email")({
  head: () =>
    seo("Verify your email", "Confirm your email address to like, save, review and publish.", true),
  component: Verify,
});

function Verify() {
  const { user, set, notify } = useStore();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  if (!user)
    return (
      <AuthCard title="Create an account first">
        <Link to="/signup" className={btnPrimary}>
          Create account
        </Link>
      </AuthCard>
    );
  return (
    <AuthCard
      title="Verify your email"
      subtitle="Email delivery is not connected in this frontend preview."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{6}$/.test(code))
            return void toast.error("Enter the 6-digit code (any 6 digits in this preview).");
          set((s) => ({ ...s, user: s.user ? { ...s.user, verified: true } : s.user }));
          notify(
            "Preview account email verification simulated — no email was sent.",
            "verification",
          );
          toast.success("Preview email verification simulated");
          navigate({ to: "/feed" });
        }}
      >
        <Field label="Verification code">
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputCls} text-center text-2xl tracking-[0.5em]`}
          />
        </Field>
        <button className={`${btnPrimary} w-full`}>Verify email</button>
        <button
          type="button"
          onClick={() =>
            toast("No email is sent in this preview. Use any six digits to test verification.")
          }
          className={`${btnOutline} w-full`}
        >
          Resend code
        </button>
      </form>
    </AuthCard>
  );
}
