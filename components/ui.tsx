"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type PU = { name: string; emoji: string; color: string; image: string | null; handle?: string; verifiedHost?: boolean };

export function Button({
  variant = "dark",
  size = "md",
  loading,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "dark" | "light" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : ""} ${className}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="loading"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
    />
  );
}

export function Chip({ on, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button type="button" aria-pressed={on} {...props} className={`chip ${on ? "chip-on" : ""} ${className}`} />;
}

export function Avatar({ user, size = 40, className = "" }: { user: PU | null | undefined; size?: number; className?: string }) {
  if (!user)
    return <span style={{ width: size, height: size }} className={`inline-block rounded-full bg-line ${className}`} />;
  return (
    <span
      style={{ width: size, height: size, background: user.image ? undefined : user.color, fontSize: size * 0.45 }}
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white ${className}`}
      title={user.name}
    >
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt={user.name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{user.emoji}</span>
      )}
    </span>
  );
}

export function AvatarStack({ users, size = 28, max = 4 }: { users: (PU | null)[]; size?: number; max?: number }) {
  const list = users.filter((u): u is PU => !!u).slice(0, max);
  if (!list.length) return null;
  return (
    <span className="flex -space-x-2">
      {list.map((u, i) => (
        <Avatar key={i} user={u} size={size} />
      ))}
    </span>
  );
}

export function Badge({ tone = "neutral", children, className = "" }: { tone?: "neutral" | "live" | "warn" | "good" | "bad"; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-black/6 text-ink",
    live: "bg-ink text-white",
    warn: "bg-[#FFEFD2] text-[#8a5a00]",
    good: "bg-mint text-[#166b3c]",
    bad: "bg-blush text-[#a11d33]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title ?? "dialog"}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-0 size-full max-h-none max-w-none items-end justify-center sm:items-center"
      style={{ display: open ? "flex" : "none" }}
    >
      <div className="animate-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white sm:max-w-lg sm:rounded-[28px]">
        {(title || subtitle) && (
          <div className="shrink-0 px-6 pb-3 pt-5">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
            {title && <h2 className="text-2xl">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-white px-6 py-4 pb-[calc(1rem+var(--sab))]">{footer}</div>}
      </div>
    </dialog>
  );
}

export function Empty({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-rise flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-white text-3xl shadow-soft">{emoji}</div>
      <h3 className="text-2xl">{title}</h3>
      {body && <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex gap-3 p-4">
          <div className="skeleton size-14 rounded-2xl" />
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      {label && <span className="label mb-1.5 block">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-semibold text-[#c02637]">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-black/5 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-3 py-2 text-sm font-bold transition ${value === o.value ? "bg-white shadow-soft" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 50 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="fewer" className="btn btn-ghost size-11 !p-0 text-xl" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="display w-10 text-center text-2xl">{value}</span>
      <button type="button" aria-label="more" className="btn btn-ghost size-11 !p-0 text-xl" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      <span className="flex-1">
        <span className="block text-[15px] font-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-ink" : "bg-black/15"}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${checked ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

export function Wordmark({ className = "text-5xl" }: { className?: string }) {
  return (
    <span className={`chrome select-none ${className}`} aria-label="PAP">
      pap
    </span>
  );
}

/** the floating collage of things people actually do */
export function FloatingObjects({ items, className = "" }: { items: [string, string, string, number][]; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {items.map(([emoji, top, left, delay], i) => (
        <span
          key={i}
          className="animate-float absolute drop-shadow-[0_10px_18px_rgba(20,40,60,0.25)]"
          style={{ top, left, animationDelay: `${delay}s`, ["--r" as string]: `${(i % 2 ? -1 : 1) * (4 + i)}deg`, fontSize: i % 3 === 0 ? 44 : 34 }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

export function TopBar({
  title,
  back,
  right,
  sub,
}: {
  title?: React.ReactNode;
  back?: string | true;
  right?: React.ReactNode;
  sub?: string;
}) {
  const router = useRouter();
  return (
    <div className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-white/60 px-4 pb-3 pt-[calc(0.75rem+var(--sat))]">
      {back && (
        <button
          onClick={() => (back === true ? router.back() : router.push(back))}
          aria-label="back"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white shadow-soft"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? <h1 className="truncate text-xl">{title}</h1> : title}
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function LinkPill({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`btn btn-light btn-sm ${className}`}>
      {children}
    </Link>
  );
}
