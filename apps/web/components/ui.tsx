import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * UI-primitiver på Tailwind-tokens. Rolig, varm flade med pilleformede
 * knapper og statuschips med prik — inspireret af Lyssnas studieoversigt.
 */

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}

const buttonStyles = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-transparent shadow-card",
  secondary: "bg-surface text-foreground border border-line-strong hover:border-accent/50 hover:text-accent",
  ghost: "bg-transparent text-foreground hover:bg-accent-soft/60 border border-transparent",
  danger: "bg-danger text-white border border-transparent hover:opacity-90",
} as const;

const buttonSizes = {
  sm: "h-7 px-3 text-xs",
  md: "h-9 px-4 text-sm",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles; size?: keyof typeof buttonSizes }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-150 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        buttonSizes[size],
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles; size?: keyof typeof buttonSizes }) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-150",
        buttonSizes[size],
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted/70 transition-colors focus:border-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 transition-colors focus:border-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm transition-colors focus:border-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-xs font-medium text-muted mb-1", className)} {...props} />;
}

const badgeStyles: Record<string, string> = {
  gray: "bg-surface-raised text-muted border-line",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  red: "bg-red-50 text-red-800 border-red-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
  accent: "bg-accent-soft text-accent border-accent/20",
};

export function Badge({ tone = "gray", className, ...props }: ComponentProps<"span"> & { tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        badgeStyles[tone] ?? badgeStyles.gray,
        className,
      )}
      {...props}
    />
  );
}

const statusDot: Record<string, string> = {
  gray: "bg-muted/50",
  green: "bg-success",
  red: "bg-danger",
  amber: "bg-warning",
  blue: "bg-sky-600",
  accent: "bg-accent",
};

/** Statuschip med farvet prik, som Lyssnas “● Recruiting”. */
export function StatusBadge({ tone = "gray", className, children, ...props }: ComponentProps<"span"> & { tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium whitespace-nowrap text-foreground",
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot[tone] ?? statusDot.gray)} />
      {children}
    </span>
  );
}

export function Card({ className, title, actions, children }: {
  className?: string; title?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-heading">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-heading">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiTile({ label, value, hint, tone }: {
  label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums text-heading",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2 text-left text-[11px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line/60 px-3 py-2 align-top", className)} {...props} />;
}

export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <p className="font-display text-base text-heading">{title}</p>
      {hint && <p className="text-xs text-muted max-w-md">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Klikbar listerække i Lyssna-stil: ikonfelt, indhold, højrestillede metadata. */
export function ListRow({ href, icon, children, meta, className }: {
  href: string; icon?: ReactNode; children: ReactNode; meta?: ReactNode; className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 shadow-card transition-all duration-150 hover:border-accent/40 hover:shadow-pop",
        className,
      )}
    >
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {meta && <div className="flex shrink-0 items-center gap-4">{meta}</div>}
    </Link>
  );
}
