"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Wordmark } from "./ui";
import { useMe } from "./hooks";

const Icon = ({ d, filled }: { d: string; filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="size-6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ITEMS = [
  { href: "/discover", label: "discover", d: "M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z M12 10.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" },
  { href: "/plans", label: "my plans", d: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { href: "/inbox", label: "inbox", d: "M20 12a8 8 0 11-3.2-6.4M21 4l-9 9" },
] as const;

export default function Nav({ hideBar = false }: { hideBar?: boolean }) {
  const path = usePathname();
  const me = useMe();
  const unread = useQuery(api.messages.unreadCount) ?? 0;
  const notifs = useQuery(api.notifications.unreadCount) ?? 0;
  const active = (href: string) => path === href || path.startsWith(href + "/");
  const badge = (href: string) => (href === "/inbox" ? unread + notifs : 0);

  return (
    <>
      {/* mobile: thumb-reach tab bar with create in the middle (chat takes the full screen instead) */}
      <nav className={`glass fixed inset-x-0 bottom-0 z-40 items-center justify-around border-t border-white/60 px-2 pb-[calc(0.4rem+var(--sab))] pt-1.5 md:hidden ${hideBar ? "hidden" : "flex"}`}>
        {ITEMS.slice(0, 2).map((i) => (
          <Tab key={i.href} {...i} active={active(i.href)} badge={badge(i.href)} />
        ))}
        <Link href="/create" aria-label="post a plan" className="-mt-6 grid size-14 shrink-0 place-items-center rounded-full bg-ink text-white shadow-lift active:scale-95">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
        <Tab {...ITEMS[2]} active={active(ITEMS[2].href)} badge={badge(ITEMS[2].href)} />
        <Link href="/me" className="flex w-16 flex-col items-center gap-1 py-1.5 text-[10px] font-bold" aria-label="profile">
          <span className={active("/me") || active("/u") ? "ring-2 ring-ink rounded-full" : ""}>
            <Avatar user={me ? { ...me, name: me.name ?? "", emoji: me.emoji ?? "🙂", color: me.color ?? "#A0C4FF" } : null} size={24} />
          </span>
          <span className={active("/me") ? "" : "text-muted"}>you</span>
        </Link>
      </nav>

      {/* desktop: quiet left rail */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line bg-white/60 px-4 py-6 md:flex">
        <Link href="/discover" className="mb-6 px-2">
          <Wordmark className="text-4xl" />
        </Link>
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-bold transition ${active(i.href) ? "bg-ink text-white" : "hover:bg-black/5"}`}
          >
            <Icon d={i.d} />
            <span>{i.label}</span>
            {badge(i.href) > 0 && (
              <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#ff4d5e] px-1.5 text-[11px] text-white">{badge(i.href)}</span>
            )}
          </Link>
        ))}
        <Link href="/circles" className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-bold transition ${active("/circles") ? "bg-ink text-white" : "hover:bg-black/5"}`}>
          <Icon d="M12 4a4 4 0 110 8 4 4 0 010-8zM4 20a8 8 0 0116 0" />
          <span>circles</span>
        </Link>
        <Link href="/search" className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-bold transition ${active("/search") ? "bg-ink text-white" : "hover:bg-black/5"}`}>
          <Icon d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" />
          <span>search</span>
        </Link>
        <Link href="/create" className="btn btn-dark mt-4">post a plan</Link>
        <Link href="/me" className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-black/5">
          <Avatar user={me ? { ...me, name: me.name ?? "", emoji: me.emoji ?? "🙂", color: me.color ?? "#A0C4FF" } : null} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{me?.name ?? "you"}</span>
            <span className="block truncate text-xs text-muted">@{me?.handle}</span>
          </span>
        </Link>
      </aside>
    </>
  );
}

function Tab({ href, label, d, active, badge }: { href: string; label: string; d: string; active: boolean; badge: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex w-16 flex-col items-center gap-1 py-1.5 text-[10px] font-bold ${active ? "text-ink" : "text-muted"}`}
    >
      <Icon d={d} filled={false} />
      {badge > 0 && (
        <span className="absolute right-3 top-0 grid min-w-4 place-items-center rounded-full bg-[#ff4d5e] px-1 text-[10px] text-white">{badge > 9 ? "9+" : badge}</span>
      )}
      <span>{label}</span>
    </Link>
  );
}
