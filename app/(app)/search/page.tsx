"use client";

import PlanCard from "@/components/PlanCard";
import { useGeo, useMe, useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Badge, Button, CardSkeleton, Empty, Segmented, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatWhen } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Tab = "people" | "plans" | "circles";

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const geo = useGeo();
  const me = useMe();
  const now = useNow();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "people");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [term, setTerm] = useState(q.trim());
  const [busy, setBusy] = useState(false);
  const openDm = useMutation(api.messages.openDm);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const people = useQuery(api.users.search, term.length >= 2 ? { q: term } : "skip");
  const friends = useQuery(api.users.friends, term.length < 2 ? {} : "skip");
  const plans = useQuery(
    api.plans.discover,
    tab === "plans" ? { lat: geo.coords.lat, lng: geo.coords.lng, radiusKm: 50, from: now, to: now + 30 * 864e5, q: term || undefined } : "skip",
  );
  const circles = useQuery(api.circles.nearby, tab === "circles" ? { lat: geo.coords.lat, lng: geo.coords.lng } : "skip");
  const matchedCircles = (circles ?? []).filter((c) => !term || `${c.name} ${c.schedule} ${c.areaName}`.toLowerCase().includes(term.toLowerCase()));

  async function message(userId: string) {
    setBusy(true);
    try {
      const key = await openDm({ userId: userId as Id<"users"> });
      router.push(`/chat/${encodeURIComponent(key)}`);
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  const list = term.length >= 2 ? people : friends;

  return (
    <div>
      <TopBar title="search" back={true} />
      <div className="space-y-3 px-4 py-3">
        <input
          className="field"
          autoFocus
          placeholder={tab === "people" ? "name or @handle" : tab === "plans" ? "badminton, coffee, a place…" : "run club, football…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "people", label: "people" },
            { value: "plans", label: "plans" },
            { value: "circles", label: "circles" },
          ]}
        />
      </div>

      <div className="space-y-2 px-4 pb-8">
        {tab === "people" && (
          <>
            {term.length < 2 && <p className="px-1 pb-1 text-xs font-bold text-muted">your friends on pap</p>}
            {list === undefined ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-16 rounded-card" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <Empty
                emoji={term.length >= 2 ? "🔍" : "👋"}
                title={term.length >= 2 ? "nobody by that name" : "no friends here yet"}
                body={
                  term.length >= 2
                    ? "try their handle, or invite them with a plan link — whoever opens it becomes your friend automatically."
                    : "join a plan, and the people you meet show up here. or share a plan link with someone you know."
                }
                action={
                  <Link href="/discover" className="btn btn-dark">
                    find a plan
                  </Link>
                }
              />
            ) : (
              list.map((u) => (
                <div key={u._id} className="card flex items-center gap-3 p-3">
                  <Link href={`/u/${u.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar user={u} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-sm font-bold">
                        {u.name}
                        {u.verifiedHost && <span title="verified host">✅</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        @{u.handle}
                        {"areaName" in u && u.areaName ? ` · ${u.areaName}` : ""}
                        {u.reliability != null ? ` · shows up ${u.reliability}%` : u.isNew ? " · new here" : ""}
                      </span>
                    </span>
                  </Link>
                  {u._id !== me?._id && (
                    <Button size="sm" variant="light" loading={busy} onClick={() => message(u._id)}>
                      message
                    </Button>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {tab === "plans" &&
          (plans === undefined ? (
            <CardSkeleton count={3} />
          ) : plans.length === 0 ? (
            <Empty emoji="🗓️" title="no plans match" body="try a wider word — “coffee”, “football”, or the name of a place." action={<Link href="/create" className="btn btn-dark">post one instead</Link>} />
          ) : (
            plans.map((p) => <PlanCard key={p._id} card={p} now={now} />)
          ))}

        {tab === "circles" &&
          (circles === undefined ? (
            <div className="skeleton h-24 rounded-card" />
          ) : matchedCircles.length === 0 ? (
            <Empty emoji="🔁" title="no circles match" body="circles are groups that meet on repeat near you." action={<Link href="/circles" className="btn btn-dark">browse circles</Link>} />
          ) : (
            matchedCircles.map((c) => (
              <Link key={c._id} href={`/c/${c.slug}`} className="card flex items-center gap-3 p-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-paper text-xl">{c.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold tracking-tight">{c.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.schedule} · {c.memberCount} members{c.nextStartAt ? ` · next ${formatWhen(c.nextStartAt, now, c.nextTz ?? undefined)}` : ""}
                  </span>
                </span>
                {c.member && <Badge tone="good">joined</Badge>}
              </Link>
            ))
          ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
