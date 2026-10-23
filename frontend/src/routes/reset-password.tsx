import { PasswordInput } from "@/components/actions";
import { Button } from "@/components/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard, btnPrimary, Field, inputCls } from "@/components/bits";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  head: () => seo("Choose a new password", "Set a new password for your Naviraa account.", true),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  return (
    <AuthCard title="New password">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (a.length < 8) return setErr("At least 8 characters.");
          if (a !== b) return setErr("Passwords don't match.");
          toast("Password form checked. No real password was changed in this preview.");
          navigate({ to: "/signin" });
        }}
      >
        <Field label="New password">
          <PasswordInput
            aria-label="New password"
            autoComplete="new-password"
            value={a}
            onChange={(e) => setA(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Confirm password">
          <PasswordInput
            aria-label="Confirm password"
            autoComplete="new-password"
            value={b}
            onChange={(e) => setB(e.target.value)}
            className={inputCls}
          />
        </Field>
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
        <Button variant="ghost" className={`${btnPrimary} w-full`}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
