import { PasswordInput } from "@/components/actions";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard, btnPrimary, Field, inputCls } from "@/components/bits";
import { useStore } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/signin")({
  head: () =>
    seo("Sign in", "Sign in to follow founders, save launches and manage your business.", true),
  component: SignIn,
});

function SignIn() {
  const { signIn } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Naviraa account">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.includes("@") || password.length < 8)
            return setError("Enter a valid email and a password of at least 8 characters.");
          signIn({
            name: email.split("@")[0] ?? "Member",
            email,
            verified: true,
            founderSlug: "meera-iyer",
          });
          toast.success("Signed in");
          navigate({ to: "/feed" });
        }}
      >
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <PasswordInput
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            autoComplete="current-password"
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="ghost" className={`${btnPrimary} w-full`}>
          Sign in
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-primary">
            Forgot password?
          </Link>
          <Link to="/signup" className="text-primary">
            Create account
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
