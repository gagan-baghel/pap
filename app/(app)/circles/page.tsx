"use client";

import { useGeo, useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Button, Chip, Empty, Field, Sheet, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, formatWhen } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CirclesPage() {
  const geo = useGeo();
  const now = useNow();
  const toast = useToast();
  const router = useRouter();
  const circles = useQuery(api.circles.nearby, { lat: geo.coords.lat, lng: geo.coords.lng });
  const setMember = useMutation(api.circles.setMember);
  const create = useMutation(api.circles.create);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState({ name: "", category: "run", description: "", schedule: "" });
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <TopBar title="circles" sub="groups that meet on repeat. join once, keep getting plans." right={<Button size="sm" onClick={() => setSheet(true)}>start one</Button>} />

      <div className="space-y-3 px-4 py-4">
        {circles === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-card" />
            ))}
          </div>
        ) : circles.length === 0 ? (
          <Empty
            emoji="🔁"
            title="no circles near you yet"
            body="a circle is the simplest way to keep a neighbourhood alive: one weekly football game, one run club, one cowork friday."
            action={<Button onClick={() => setSheet(true)}>start the first one</Button>}
          />
        ) : (
          circles.map((c) => (
            <div key={c._id} className="card flex items-center gap-3.5 p-4">
              <Link href={`/c/${c.slug}`} className="grid size-14 shrink-0 place-items-center rounded-2xl bg-paper text-2xl">
                {c.emoji}
              </Link>
              <Link href={`/c/${c.slug}`} className="min-w-0 flex-1">
                <p className="display truncate text-lg">{c.name}</p>
                <p className="truncate text-xs text-muted">{c.schedule} · {c.areaName}</p>
                <p className="mt-1 truncate text-xs font-bold text-muted">
                  {c.memberCount} members{c.nextStartAt ? ` · next ${formatWhen(c.nextStartAt, now, c.nextTz ?? undefined)}` : " · nothing scheduled"}
                </p>
              </Link>
              <Button
                size="sm"
                variant={c.member ? "light" : "dark"}
                onClick={async () => {
                  try {
                    await setMember({ circleId: c._id, on: !c.member });
                    toast(c.member ? "left the circle" : "you're in — you'll hear about every session");
                  } catch (e) {
                    toast(errorText(e), "bad");
                  }
                }}
              >
                {c.member ? "joined" : "join"}
              </Button>
            </div>
          ))
        )}
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="start a circle"
        subtitle="a name, when it usually happens, and what it is. you can post sessions right after."
        footer={
          <Button
            className="btn-block"
            loading={busy}
            disabled={form.name.trim().length < 3 || !form.schedule.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const slug = await create(form);
                toast("circle created 🎉");
                setSheet(false);
                router.push(`/c/${slug}`);
              } catch (e) {
                toast(errorText(e), "bad");
              } finally {
                setBusy(false);
              }
            }}
          >
            create circle
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Field label="name">
            <input className="field" placeholder="sunday footy" maxLength={50} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="what kind">
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
              {CATEGORIES.map((c) => (
                <Chip key={c.key} on={form.category === c.key} className="shrink-0" onClick={() => setForm({ ...form, category: c.key })}>
                  <span>{c.emoji}</span> {c.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="when does it usually happen">
            <input className="field" placeholder="sundays, 7am" maxLength={60} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
          </Field>
          <Field label="what should people know">
            <textarea className="field min-h-[80px] resize-none" maxLength={500} placeholder="regular 5-a-side. turf split, rotating teams, everyone plays." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
