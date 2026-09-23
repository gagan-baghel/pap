"use client";

import { useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Button, Empty, Segmented, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatWhen, timeAgo } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function InboxPage() {
  const [tab, setTab] = useState<"chats" | "activity">("chats");
  const threads = useQuery(api.messages.inbox);
  const notifications = useQuery(api.notifications.list);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const markRead = useMutation(api.notifications.markRead);
  const follow = useMutation(api.users.follow);
  const toast = useToast();
  const now = useNow();
  const unreadNotifs = (notifications ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    if (tab === "activity" && unreadNotifs > 0) markAllRead({});
  }, [tab, unreadNotifs, markAllRead]);

  return (
    <div>
      <TopBar
        title="inbox"
        right={
          <Link href="/search" className="btn btn-light btn-sm" aria-label="find people">
            ✎ new
          </Link>
        }
      />
      <div className="px-4 py-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "chats", label: "chats" },
            { value: "activity", label: `activity${unreadNotifs ? ` (${unreadNotifs})` : ""}` },
          ]}
        />
      </div>

      {tab === "chats" ? (
        <div className="space-y-2 px-4 pb-6">
          {threads === undefined ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16 rounded-card" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <Empty emoji="💬" title="no chats yet" body="every plan you join comes with its own group chat. that's where the “where exactly?” questions go." action={<Link href="/discover" className="btn btn-dark">find a plan</Link>} />
          ) : (
            threads.map((t) => (
              <Link key={t.threadKey} href={`/chat/${encodeURIComponent(t.threadKey)}`} className="card flex items-center gap-3 p-3.5">
                {t.kind === "dm" ? (
                  <Avatar user={t.other} size={46} />
                ) : (
                  <span className="grid size-[46px] shrink-0 place-items-center rounded-2xl bg-paper text-2xl">{t.emoji}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-extrabold tracking-tight">{t.title}</span>
                    {t.unread && <span className="size-2 shrink-0 rounded-full bg-[#ff4d5e]" />}
                  </span>
                  <span className="block truncate text-xs text-muted">{t.preview ?? "say hi 👋"}</span>
                  {t.kind === "plan" && t.status === "active" && t.endAt > now && (
                    <span className="block truncate text-[11px] font-bold text-muted">{formatWhen(t.startAt, now)}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-faint">{t.lastMessageAt ? timeAgo(t.lastMessageAt, now) : ""}</span>
              </Link>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2 px-4 pb-6">
          {notifications === undefined ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-14 rounded-card" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <Empty emoji="🔔" title="nothing yet" body="joins, changes, reminders an hour before a plan, and nudges when someone you follow posts something." />
          ) : (
            notifications.map((n) => {
              const inner = (
                <>
                  {n.actor ? <Avatar user={n.actor} size={38} /> : <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-paper">{n.emoji ?? "🔔"}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug">{n.text}</span>
                    <span className="block text-[11px] text-faint">{timeAgo(n.at, now)}</span>
                  </span>
                  {!n.read && <span className="size-2 shrink-0 rounded-full bg-[#ff4d5e]" />}
                </>
              );
              const href = n.planId ? `/p/${n.planId}` : n.actor?.handle ? `/u/${n.actor.handle}` : null;
              return (
                <div key={n._id} className="card flex items-center gap-3 p-3.5">
                  {href ? (
                    <Link href={href} onClick={() => !n.read && markRead({ id: n._id })} className="flex min-w-0 flex-1 items-center gap-3">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
                  )}
                  {n.followBack && n.actor && (
                    <Button
                      size="sm"
                      onClick={() =>
                        follow({ userId: n.actor!._id as Id<"users">, on: true })
                          .then(() => toast(`you and ${n.actor!.name} are friends now 🤝`))
                          .catch((e) => toast(errorText(e), "bad"))
                      }
                    >
                      follow back
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
