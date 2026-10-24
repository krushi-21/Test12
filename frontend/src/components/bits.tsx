import { Link } from "@tanstack/react-router";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";
import { useStore } from "@/lib/store";

export const inputCls =
  "w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
export const btnOutline =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium hover:border-primary";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const content = Children.map(children, (child) =>
    isValidElement(child) &&
    typeof child.type === "string" &&
    ["input", "select", "textarea"].includes(child.type)
      ? cloneElement(child as ReactElement<Record<string, unknown>>, {
          id,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        })
      : child,
  );
  return (
    <div className="block space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {content}
      {hint && (
        <span id={`${id}-hint`} className="block text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-xl font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Renders children for signed-in users, otherwise an inline sign-in prompt. */
export function SignedIn({
  children,
  what = "continue",
  needVerified = false,
}: {
  children: ReactNode;
  what?: string;
  needVerified?: boolean;
}) {
  const { user } = useStore();
  if (!user)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="font-display text-2xl font-semibold">Sign in to {what}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Join India's launch community — it's free.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/signin" className={btnPrimary}>
            Sign in
          </Link>
          <Link to="/signup" className={btnOutline}>
            Create account
          </Link>
        </div>
      </div>
    );
  if (needVerified && !user.verified)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <p className="font-display text-2xl font-semibold">Verify your email</p>
        <p className="mt-2 text-sm text-muted-foreground">You need a verified email to {what}.</p>
        <Link to="/verify-email" className={`${btnPrimary} mt-6`}>
          Verify now
        </Link>
      </div>
    );
  return <>{children}</>;
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <div className="w-full rounded-lg border border-border bg-card px-8 py-10">
        <h1 className="text-center font-display text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
