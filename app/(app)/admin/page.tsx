"use client";

import { useMe, useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Badge, Button, Empty, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";

const ACTIONS = [
  { key: "dismiss", label: "dismiss", variant: "light" as const },
  { key: "hide_plan", label: "hide plan", variant: "light" as const },
  { key: "restore_plan", label: "restore plan", variant: "light" as const },
  { key: "hide_circle", label: "pause circle", variant: "light" as const },
  { key: "restore_circle", label: "restore circle", variant: "light" as const },
  { key: "delete_message", label: "remove message", variant: "light" as const },
  { key: "suspend_user", label: "suspend 30 days", variant: "danger" as const },
  { key: "unsuspend_user", label: "lift suspension", variant: "light" as const },
] as const;

const ALLOWED: Record<string, string[]> = {
  plan: ["dismiss", "hide_plan", "restore_plan", "suspend_user", "unsuspend_user"],
  circle: ["dismiss", "hide_circle", "restore_circle", "suspend_user", "unsuspend_user"],
  message: ["dismiss", "delete_message", "suspend_user", "unsuspend_user"],
  user: ["dismiss", "suspend_user", "unsuspend_user"],
};

export default function AdminPage() {
  const me = useMe();
  const queue = useQuery(api.moderation.queue, me?.isAdmin ? {} : "skip");
  const resolve = useMutation(api.moderation.resolve);
  const toast = useToast();
  const now = useNow();

  if (me && !me.isAdmin)
    return <Empty emoji="🛡️" title="admins only" body="this is the moderation queue." action={<Link href="/discover" className="btn btn-dark">back</Link>} />;

  return (
    <div>
      <TopBar title="moderation" sub="open reports, newest first. plans auto-pause at three reports." back="/settings" />
      <div className="space-y-3 px-4 py-4">
        {queue === undefined ? (
          <div className="skeleton h-28 rounded-card" />
        ) : queue.length === 0 ? (
          <Empty emoji="✨" title="queue's clear" body="nothing waiting on a human right now." />
        ) : (
          queue.map((r) => (
            <div key={r._id} className="card space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Badge tone="bad">{r.reason}</Badge>
                <Badge tone="neutral">{r.targetType}</Badge>
                <span className="ml-auto text-xs text-faint">{timeAgo(r.at, now)}</span>
              </div>
              <div>
                <p className="font-extrabold tracking-tight">{r.target.title}</p>
                <p className="text-xs text-muted">{r.target.subtitle}</p>
                {r.details && <p className="mt-1 text-sm">“{r.details}”</p>}
                {r.target.link && (
                  <Link href={r.target.link} className="mt-1 inline-block text-xs font-bold underline">
                    open
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Avatar user={r.reporter} size={24} />
                <span className="text-xs text-muted">reported by {r.reporter?.name}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.filter((a) => (ALLOWED[r.targetType] ?? ["dismiss"]).includes(a.key)).map((a) => (
                  <Button
                    key={a.key}
                    size="sm"
                    variant={a.variant}
                    onClick={async () => {
                      try {
                        await resolve({ reportId: r._id, action: a.key });
                        toast(`done: ${a.label}`);
                      } catch (e) {
                        toast(errorText(e), "bad");
                      }
                    }}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
