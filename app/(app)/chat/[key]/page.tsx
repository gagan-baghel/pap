"use client";

import { useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Button, Empty, Sheet, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { REPORT_REASONS, formatWhen, timeAgo } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";

export default function ChatPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const threadKey = decodeURIComponent(key);
  const thread = useQuery(api.messages.list, { threadKey });
  const send = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const toast = useToast();
  const now = useNow();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ id: string; userId: string; name: string; handle: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const report = useMutation(api.moderation.report);
  const block = useMutation(api.users.block);
  const bottom = useRef<HTMLDivElement>(null);
  const count = thread?.messages.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    if (thread) markRead({ threadKey });
  }, [count, thread, threadKey, markRead]);

  if (thread === undefined) return <div className="p-6 text-sm text-muted">loading…</div>;
  if (thread === null)
    return <Empty emoji="🔒" title="not your chat" body="plan chats are only for people who are in. dms open once you've been on a plan together." action={<Link href="/inbox" className="btn btn-dark">back to inbox</Link>} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await send({ threadKey, body });
      setText("");
    } catch (err) {
      toast(errorText(err), "bad");
    } finally {
      setBusy(false);
    }
  }

  const title =
    thread.kind === "plan" ? (
      <Link href={`/p/${thread.planId}`} className="block">
        <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight lowercase">
          <span>{thread.emoji}</span>
          <span className="truncate">{thread.title}</span>
        </span>
        <span className="block truncate text-xs text-muted">
          {formatWhen(thread.startAt, now, thread.tz ?? undefined)} · {thread.members} in the chat
        </span>
      </Link>
    ) : (
      <Link href={`/u/${thread.other?.handle}`} className="flex items-center gap-2">
        <Avatar user={thread.other} size={32} />
        <span className="truncate text-lg font-extrabold tracking-tight lowercase">{thread.other?.name}</span>
      </Link>
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title={title} back="/inbox" />

      <div className="flex-1 space-y-2.5 px-4 py-4">
        {thread.messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            {thread.kind === "plan" ? "sort out the last details here — where exactly, who's bringing what." : "say hi."}
          </p>
        )}
        {thread.messages.map((m) =>
          m.kind === "system" ? (
            <p key={m._id} className="py-1 text-center text-[11px] font-semibold text-faint">
              {m.body}
            </p>
          ) : (
            <div key={m._id} className={`flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
              {!m.mine && <Avatar user={m.author} size={28} />}
              <div
                onClick={() => !m.mine && m.author && setActive({ id: m._id, userId: m.author._id, name: m.author.name, handle: m.author.handle })}
                className={`max-w-[78%] rounded-3xl px-3.5 py-2.5 ${m.mine ? "rounded-br-lg bg-ink text-white" : "cursor-pointer rounded-bl-lg bg-white"}`}
              >
                {!m.mine && thread.kind === "plan" && <p className="mb-0.5 text-[11px] font-bold text-muted">{m.author?.name}</p>}
                <p className="whitespace-pre-wrap text-[15px] leading-snug">{m.body}</p>
                <p className={`mt-1 text-[10px] ${m.mine ? "text-white/50" : "text-faint"}`}>{timeAgo(m.at, now)}</p>
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="glass sticky bottom-0 flex gap-2 border-t border-white/60 p-3 pb-[calc(0.75rem+var(--sab))]">
        <input
          className="field !py-3"
          placeholder={thread.readOnly ? "this chat is closed" : "message…"}
          value={text}
          maxLength={1000}
          disabled={thread.readOnly}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" disabled={!text.trim() || thread.readOnly} loading={busy}>
          send
        </Button>
      </form>

      <Sheet open={!!active && !reporting} onClose={() => setActive(null)} title={active?.name ?? ""}>
        <div className="space-y-2 py-2">
          <Link href={`/u/${active?.handle}`} className="btn btn-light btn-block justify-start">
            👤 see their profile
          </Link>
          <Button variant="light" className="btn-block justify-start" onClick={() => setReporting(true)}>
            🚩 report this message
          </Button>
          <Button
            variant="danger"
            className="btn-block justify-start"
            onClick={async () => {
              try {
                await block({ userId: active!.userId as Id<"users">, on: true });
                toast(`${active!.name} is blocked`);
                setActive(null);
              } catch (e) {
                toast(errorText(e), "bad");
              }
            }}
          >
            🚫 block {active?.name}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={reporting}
        onClose={() => {
          setReporting(false);
          setActive(null);
        }}
        title="report this message"
        subtitle="a moderator reads every report."
      >
        <div className="flex flex-col gap-2 py-2">
          {REPORT_REASONS.map((r) => (
            <Button
              key={r}
              variant="light"
              className="btn-block justify-start"
              onClick={async () => {
                try {
                  await report({ targetType: "message", targetId: active!.id, reason: r });
                  toast("thanks — we're on it");
                } catch (e) {
                  toast(errorText(e), "bad");
                }
                setReporting(false);
                setActive(null);
              }}
            >
              {r}
            </Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
