import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard, btnPrimary, Field, inputCls } from "@/components/bits";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/forgot-password")({
  head: () => seo("Reset your password", "Get a link to reset your Naviraa password.", true),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <AuthCard
      title="Forgot password?"
      subtitle="Email delivery is not connected in this frontend preview."
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm">
            The reset form is ready to preview. No email has been sent to <strong>{email}</strong>.
          </p>
          <Link to="/reset-password" className={btnPrimary}>
            Open reset link (preview)
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.includes("@")) setSent(true);
          }}
        >
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </Field>
          <button className={`${btnPrimary} w-full`}>Send reset link</button>
          <p className="text-center text-sm">
            <Link to="/signin" className="text-primary">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
