import { PasswordInput } from "@/components/actions";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard, btnPrimary, Field, inputCls } from "@/components/bits";
import { useStore } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/signup")({
  head: () =>
    seo(
      "Create account",
      "Join Naviraa to launch your business or discover what India is building.",
    ),
  component: SignUp,
});

function SignUp() {
  const { signIn } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", founder: true });
  const [error, setError] = useState("");
  return (
    <AuthCard title="Join Naviraa" subtitle="Discover what India is building">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.name.trim()) return setError("Please add your name.");
          if (!f.email.includes("@")) return setError("Please enter a valid email.");
          if (f.password.length < 8) return setError("Password must be at least 8 characters.");
          signIn({
            name: f.name,
            email: f.email,
            verified: false,
            ...(f.founder ? { founderSlug: "meera-iyer" } : {}),
          });
          navigate({ to: "/verify-email" });
        }}
      >
        <Field label="Full name">
          <input
            autoComplete="name"
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Email">
          <input
            required
            autoComplete="email"
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <PasswordInput
            aria-label="Password"
            autoComplete="new-password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["I'm a founder", true],
            ["I'm exploring", false],
          ].map(([l, v]) => (
            <Button
              variant="ghost"
              type="button"
              key={String(v)}
              onClick={() => setF({ ...f, founder: v as boolean })}
              className={`rounded-xl border px-3 py-3 text-sm ${f.founder === v ? "border-primary bg-secondary" : "border-border"}`}
            >
              {l}
            </Button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="ghost" className={`${btnPrimary} w-full`}>
          Create account
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already a member?{" "}
          <Link to="/signin" className="text-primary">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
