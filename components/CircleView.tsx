"use client";

import PlanCard from "@/components/PlanCard";
import { useNow, useShare } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, AvatarStack, Button, Chip, Empty, Field, Sheet, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, REPORT_REASONS } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CircleView({ slug }: { slug: string }) {
  const data = useQuery(api.circles.get, { slug });
  const setMember = useMutation(api.circles.setMember);
  const update = useMutation(api.circles.update);
  const archive = useMutation(api.circles.archive);
  const report = useMutation(api.moderation.report);
  const share = useShare();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [editSheet, setEditSheet] = useState(false);
  const [moreSheet, setMoreSheet] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [form, setForm] = useState({ name: "", category: "run", description: "", schedule: "" });

  if (data === undefined)
    return (
      <div className="space-y-4 p-5 pt-[calc(1.25rem+var(--sat))]">
        <div className="skeleton size-16 rounded-3xl" />
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-64" />
        <div className="skeleton h-24 w-full rounded-card" />
      </div>
    );
  if (data === null)
    return (
      <Empty
        emoji="🔍"
        title="no such circle"
        body="it may have been renamed, or the link is wrong."
        action={
          <Link href="/circles" className="btn btn-dark">
            see circles near you
          </Link>
        }
      />
    );

  const c = data.circle;
  return (
    <div className="pb-8">
      <TopBar
        title=""
        back="/circles"
        right={
          data.isOrganizer ? (
            <Button
              size="sm"
              variant="light"
              onClick={() => {
                setForm({ name: c.name, category: c.category, description: c.description, schedule: c.schedule });
                setEditSheet(true);
              }}
            >
              edit
            </Button>
          ) : (
            <button onClick={() => setMoreSheet(true)} aria-label="more about this circle" className="grid size-9 place-items-center rounded-full bg-white shadow-soft">
              ···
            </button>
          )
        }
      />
      <div className="px-5">
        {c.hidden && (
          <div className="mb-4 rounded-card bg-[#FFEFD2] p-4 text-sm font-bold text-[#8a5a00]">
            this circle is paused — only you can see it. it's either archived, or under review after reports.
          </div>
        )}
        <div className="grid size-16 place-items-center rounded-3xl bg-white text-3xl shadow-soft">{c.emoji}</div>
        <h1 className="mt-4 text-3xl">{c.name}</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          {c.schedule} · {c.areaName} · {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">{c.description}</p>

        <div className="mt-5 flex gap-2">
          <Button
            className="flex-1"
            variant={data.member ? "light" : "dark"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await setMember({ circleId: c._id, on: !data.member });
                toast(data.member ? "left the circle" : "you're in — you'll hear about every session");
              } catch (e) {
                toast(errorText(e), "bad");
              } finally {
                setBusy(false);
              }
            }}
          >
            {data.member ? "joined ✓" : "join circle"}
          </Button>
          <Link href={`/create?circle=${slug}`} className="btn btn-light">
            post a session
          </Link>
        </div>
        {!data.member && <p className="mt-2 text-xs text-muted">joining tells you when someone posts the next session. you can leave any time.</p>}

        <div className="mt-6 flex items-center gap-3">
          <AvatarStack users={data.members} size={30} max={6} />
          <p className="text-xs text-muted">
            organised by <span className="font-bold text-ink">{data.organizer?.name}</span>
          </p>
        </div>
      </div>

      <section className="mt-7 px-4">
        <h2 className="px-1 text-2xl">next sessions</h2>
        <div className="mt-3 space-y-3">
          {data.plans.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="text-sm font-bold">nothing scheduled right now.</p>
              <p className="mt-1 text-xs text-muted">anyone in the circle can post the next one — that's how circles stay alive.</p>
              <Link href={`/create?circle=${slug}`} className="btn btn-dark btn-sm mt-3">
                post a session
              </Link>
            </div>
          ) : (
            data.plans.map((p) => <PlanCard key={p._id} card={p} now={now} />)
          )}
        </div>
      </section>

      <Sheet
        open={editSheet}
        onClose={() => setEditSheet(false)}
        title="edit circle"
        subtitle="members see these changes immediately."
        footer={
          <Button
            className="btn-block"
            loading={busy}
            disabled={form.name.trim().length < 3 || !form.schedule.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await update({ circleId: c._id, ...form });
                toast("circle updated");
                setEditSheet(false);
              } catch (e) {
                toast(errorText(e), "bad");
              } finally {
                setBusy(false);
              }
            }}
          >
            save changes
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Field label="name">
            <input className="field" maxLength={50} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="what kind">
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
              {CATEGORIES.map((x) => (
                <Chip key={x.key} on={form.category === x.key} className="shrink-0" onClick={() => setForm({ ...form, category: x.key })}>
                  <span>{x.emoji}</span> {x.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="when does it usually happen">
            <input className="field" maxLength={60} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
          </Field>
          <Field label="what should people know">
            <textarea
              className="field min-h-[80px] resize-none"
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Button
            variant="danger"
            className="btn-block justify-start"
            onClick={async () => {
              try {
                await archive({ circleId: c._id });
                toast("circle archived");
                setEditSheet(false);
                router.push("/circles");
              } catch (e) {
                toast(errorText(e), "bad");
              }
            }}
          >
            🗄️ archive this circle
          </Button>
          <p className="text-xs leading-relaxed text-muted">
            archiving hides the circle and stops the notifications. cancel any upcoming sessions first so nobody turns up to nothing.
          </p>
        </div>
      </Sheet>

      <Sheet open={moreSheet} onClose={() => setMoreSheet(false)} title={c.name}>
        <div className="space-y-2 py-2">
          <Button
            variant="light"
            className="btn-block justify-start"
            onClick={async () => {
              const r = await share(`/c/${slug}`, c.name, `${c.schedule} · ${c.areaName}`);
              if (r === "copied") toast("link copied");
              setMoreSheet(false);
            }}
          >
            🔗 share this circle
          </Button>
          <Button variant="light" className="btn-block justify-start" onClick={() => (setMoreSheet(false), setReportSheet(true))}>
            🚩 report this circle
          </Button>
        </div>
      </Sheet>

      <Sheet open={reportSheet} onClose={() => setReportSheet(false)} title="report this circle" subtitle="a moderator reads every report.">
        <div className="flex flex-col gap-2 py-2">
          {REPORT_REASONS.map((r) => (
            <Button
              key={r}
              variant="light"
              className="btn-block justify-start"
              onClick={async () => {
                try {
                  await report({ targetType: "circle", targetId: c._id, reason: r });
                  toast("thanks — we're on it");
                } catch (e) {
                  toast(errorText(e), "bad");
                }
                setReportSheet(false);
              }}
            >
              {r}
            </Button>
          ))}
        </div>
      </Sheet>

      {data.members.length > 0 && (
        <section className="mt-7 px-4">
          <h2 className="px-1 text-2xl">members</h2>
          <div className="mt-3 space-y-2">
            {data.members.map((m) => (
              <Link key={m._id} href={`/u/${m.handle}`} className="card flex items-center gap-3 p-3">
                <Avatar user={m} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{m.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {m.reliability != null ? `shows up ${m.reliability}% of the time` : `${m.attended} plans done`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
