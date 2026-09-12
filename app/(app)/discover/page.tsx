"use client";

import MapView from "@/components/MapView";
import PlanCard, { type Card } from "@/components/PlanCard";
import { useGeo, useMe, useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { AvatarStack, Button, CardSkeleton, Chip, Empty, Segmented, Sheet } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, category, formatDuration, formatWhen } from "@/convex/shared";
import { reverseArea } from "@/lib/places";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Win = "now" | "tonight" | "tomorrow" | "weekend" | "week";

const WINDOWS: { key: Win; label: string }[] = [
  { key: "now", label: "right now" },
  { key: "tonight", label: "tonight" },
  { key: "tomorrow", label: "tomorrow" },
  { key: "weekend", label: "this weekend" },
  { key: "week", label: "this week" },
];

function range(w: Win, now: number): [number, number] {
  const startOfDay = (offset = 0) => {
    const x = new Date(now);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() + offset);
    return x.getTime();
  };
  switch (w) {
    case "now":
      return [now, now + 2 * 36e5];
    case "tonight":
      return [now, startOfDay(1) + 3 * 36e5];
    case "tomorrow":
      return [startOfDay(1), startOfDay(2)];
    case "weekend": {
      const day = new Date(now).getDay();
      if (day === 6 || day === 0) return [now, startOfDay(day === 6 ? 2 : 1)];
      return [startOfDay(6 - day), startOfDay(8 - day)];
    }
    case "week":
      return [now, now + 7 * 864e5];
  }
}

export default function DiscoverPage() {
  const now = useNow();
  const me = useMe();
  const geo = useGeo();
  const toast = useToast();
  const [win, setWin] = useState<Win>("tonight");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ maxCost?: number; size?: "small" | "big"; openOnly: boolean; friends: boolean }>({ openOnly: true, friends: false });
  const [showFilters, setShowFilters] = useState(false);
  const [showFree, setShowFree] = useState(false);
  const [showPlace, setShowPlace] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [radiusOverride, setRadiusOverride] = useState<number | null>(null);
  const [sort, setSort] = useState<"best" | "soon" | "near">("best");
  // the slider wins while you're dragging it; otherwise your saved preference does
  const radius = radiusOverride ?? me?.radiusKm ?? 10;

  const setFree = useMutation(api.users.setFree);
  const updateLocation = useMutation(api.users.updateLocation);
  const updateSettings = useMutation(api.users.updateSettings);
  const demoHere = useMutation(api.seed.demoHere);
  const friendsFree = useQuery(api.users.friendsFree) ?? [];
  const circles = useQuery(api.circles.nearby, { lat: geo.coords.lat, lng: geo.coords.lng });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);


  const freeNow = !!me?.freeUntil && me.freeUntil > now;
  const freeUntil = me?.freeUntil;
  const minute = Math.floor(now / 60000);
  const [from, to] = useMemo(() => {
    const at = minute * 60000;
    const r = range(win, at);
    return freeNow && win === "now" && freeUntil ? ([at, freeUntil] as [number, number]) : r;
  }, [win, minute, freeNow, freeUntil]);
  const args = {

    lat: geo.coords.lat,
    lng: geo.coords.lng,
    radiusKm: radius,
    from,
    to,
    category: cat ?? undefined,
    q: debouncedQ || undefined,
    maxCost: filters.maxCost,
    size: filters.size,
    openOnly: filters.openOnly || undefined,
    friends: filters.friends || undefined,
    freeWindow: freeNow && win === "now" ? true : undefined,
    sort,
  };
  const plans = useQuery(api.plans.discover, args);
  // widen the net automatically instead of showing an empty screen
  const fallback = useQuery(api.plans.discover, plans && plans.length === 0 ? { ...args, from: now, to: now + 14 * 864e5, freeWindow: undefined } : "skip");

  const points = (plans ?? []).map((p) => ({ id: p._id, lat: p.lat, lng: p.lng, emoji: category(p.category).emoji, live: p.startAt <= now }));
  const railRef = useRef<HTMLDivElement>(null);

  async function seedDemo() {
    setSeeding(true);
    try {
      const areaName = (await reverseArea(geo.coords.lat, geo.coords.lng)) || me?.areaName;
      await demoHere({
        lat: geo.coords.lat,
        lng: geo.coords.lng,
        areaName,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      toast("demo plans dropped around you 🎪");
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <header className="glass sticky top-0 z-30 border-b border-white/60 px-4 pb-3 pt-[calc(0.75rem+var(--sat))]">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPlace(true)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span className="text-lg">📍</span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold tracking-tight lowercase">{geo.label}</span>
              <span className="block truncate whitespace-nowrap text-[11px] font-semibold text-muted">within {radius} km · tap to change</span>
            </span>
          </button>
          <Segmented options={[{ value: "list", label: "list" }, { value: "map", label: "map" }]} value={view} onChange={setView} />
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className="field !py-2.5 min-w-[6rem] flex-1"
            placeholder="search plans, places, people's words…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button onClick={() => setShowFilters(true)} className="btn btn-light btn-sm shrink-0" aria-label="filters">
            filters{filters.maxCost != null || filters.size || filters.friends || sort !== "best" ? " ·" : ""}
          </button>
          <Link href="/search" className="btn btn-light btn-sm shrink-0" aria-label="find people">
            people
          </Link>
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          <Chip on={freeNow} onClick={() => setShowFree(true)} className="shrink-0">
            {freeNow ? `⚡ free for ${formatDuration(me!.freeUntil! - now)}` : "⚡ i'm free now"}
          </Chip>
          {WINDOWS.map((w) => (
            <Chip key={w.key} on={win === w.key} onClick={() => setWin(w.key)} className="shrink-0">
              {w.label}
            </Chip>
          ))}
        </div>

        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          <Chip on={!cat} onClick={() => setCat(null)} className="shrink-0">
            everything
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.key} on={cat === c.key} onClick={() => setCat(cat === c.key ? null : c.key)} className="shrink-0">
              <span>{c.emoji}</span> {c.label}
            </Chip>
          ))}
        </div>
      </header>

      {friendsFree.length > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-card bg-ink p-3.5 text-white">
          <AvatarStack users={friendsFree} size={30} />
          <p className="flex-1 text-sm font-bold">
            {friendsFree.length === 1 ? `${friendsFree[0].name} is free right now` : `${friendsFree.length} friends are free right now`}
            {friendsFree[0].freeNote && <span className="block text-xs font-medium text-white/70">“{friendsFree[0].freeNote}”</span>}
          </p>
          <Link href="/create" className="btn btn-light btn-sm">
            post something
          </Link>
        </div>
      )}

      {geo.source === "default" && (
        <div className="card mx-4 mt-4 p-4">
          <p className="font-extrabold tracking-tight">we're guessing where you are</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            showing what's on around {geo.label}. turn location on — or set your area — and distances, timings and matches become real.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={geo.asking} onClick={() => geo.locate()}>
              📍 use my location
            </Button>
            <Button size="sm" variant="light" onClick={() => setShowPlace(true)}>
              set my area
            </Button>
          </div>
          {geo.denied && <p className="mt-2 text-[11px] text-muted">your browser is blocking location — setting an area works just as well.</p>}
        </div>
      )}

      {view === "map" ? (
        <div className="relative">
          <MapView
            center={geo.coords}
            points={points}
            selectedId={selected}
            onSelect={(id) => {
              setSelected(id);
              document.getElementById(`rail-${id}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
            className="h-[calc(100dvh-260px)] w-full"
          />
          <div ref={railRef} className="no-scrollbar absolute inset-x-0 bottom-[calc(92px+var(--sab))] z-20 flex gap-3 overflow-x-auto px-4 md:bottom-4">
            {(plans ?? []).map((p) => (
              <div key={p._id} id={`rail-${p._id}`} className="w-[86%] max-w-sm shrink-0" onMouseEnter={() => setSelected(p._id)}>
                <PlanCard card={p} now={now} />
              </div>
            ))}
            {plans?.length === 0 && (
              <div className="card mx-auto p-4 text-center text-sm font-semibold text-muted">nothing here in this window — try “this week”.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          {plans === undefined ? (
            <CardSkeleton count={4} />
          ) : plans.length > 0 ? (
            <>
              <p className="px-1 text-xs font-bold text-muted">
                {plans.length} {plans.length === 1 ? "plan" : "plans"} · {WINDOWS.find((w) => w.key === win)!.label}
              </p>
              {plans.map((p) => (
                <PlanCard key={p._id} card={p} now={now} />
              ))}
            </>
          ) : (
            <EmptyDiscover
              win={win}
              fallback={fallback}
              now={now}
              seeding={seeding}
              onSeed={seedDemo}
              onWiden={() => setWin("week")}
              hasCircles={!!circles?.length}
            />
          )}

          {!!circles?.length && (
            <section className="pt-6">
              <div className="flex items-end justify-between px-1">
                <h2 className="text-2xl">circles near you</h2>
                <Link href="/circles" className="text-xs font-bold text-muted">
                  see all
                </Link>
              </div>
              <p className="mb-3 px-1 text-xs text-muted">groups that meet on repeat — join once, keep getting plans.</p>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
                {circles.slice(0, 6).map((c) => (
                  <Link key={c._id} href={`/c/${c.slug}`} className="card w-56 shrink-0 p-4">
                    <div className="text-2xl">{c.emoji}</div>
                    <p className="display mt-2 text-lg leading-tight">{c.name}</p>
                    <p className="mt-1 text-xs text-muted">{c.schedule}</p>
                    <p className="mt-2 text-xs font-bold text-muted">
                      {c.memberCount} members{c.nextStartAt ? ` · next ${formatWhen(c.nextStartAt, now, c.nextTz ?? undefined)}` : ""}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <FreeSheet
        open={showFree}
        onClose={() => setShowFree(false)}
        freeUntil={freeNow ? me!.freeUntil! : null}
        now={now}
        onSet={async (minutes, note) => {
          try {
            await setFree({ minutes, note });
            setShowFree(false);
            if (minutes) {
              setWin("now");
              toast("nice — showing what fits your window");
            }
          } catch (e) {
            toast(errorText(e), "bad");
          }
        }}
      />

      <Sheet open={showFilters} onClose={() => setShowFilters(false)} title="filters" subtitle="only what actually helps you pick.">
        <div className="space-y-5 py-2">
          <div>
            <p className="label mb-2">order by</p>
            <div className="flex gap-2">
              {[
                { label: "best match", v: "best" as const },
                { label: "soonest", v: "soon" as const },
                { label: "closest", v: "near" as const },
              ].map((o) => (
                <Chip key={o.v} on={sort === o.v} onClick={() => setSort(o.v)}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="label mb-2">cost</p>
            <div className="flex gap-2">
              {[
                { label: "any", v: undefined },
                { label: "free only", v: 0 },
                { label: "under ₹300", v: 300 },
                { label: "under ₹800", v: 800 },
              ].map((o) => (
                <Chip key={o.label} on={filters.maxCost === o.v} onClick={() => setFilters((f) => ({ ...f, maxCost: o.v }))}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="label mb-2">group size</p>
            <div className="flex gap-2">
              {[
                { label: "any", v: undefined },
                { label: "small (≤5)", v: "small" as const },
                { label: "bigger", v: "big" as const },
              ].map((o) => (
                <Chip key={o.label} on={filters.size === o.v} onClick={() => setFilters((f) => ({ ...f, size: o.v }))}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="label mb-2">who</p>
            <div className="flex gap-2">
              <Chip on={filters.openOnly} onClick={() => setFilters((f) => ({ ...f, openOnly: !f.openOnly }))}>
                spots available
              </Chip>
              <Chip on={filters.friends} onClick={() => setFilters((f) => ({ ...f, friends: !f.friends }))}>
                friends are going
              </Chip>
            </div>
          </div>
        </div>
        <div className="pb-2 pt-4">
          <Button className="btn-block" onClick={() => setShowFilters(false)}>
            show plans
          </Button>
        </div>
      </Sheet>

      <Sheet open={showPlace} onClose={() => setShowPlace(false)} title="where are you looking?" subtitle="we only ever keep your rough area.">
        <div className="space-y-4 py-2">
          <Button variant="light" className="btn-block" loading={geo.asking} onClick={() => geo.locate()}>
            📍 use my current location
          </Button>
          {geo.denied && <p className="text-xs text-muted">your browser is blocking location. set your area below instead.</p>}
          <div>
            <p className="label mb-2">search radius · {radius} km</p>
            <input
              type="range"
              min={1}
              max={50}
              value={radius}
              onChange={(e) => setRadiusOverride(Number(e.target.value))}
              onPointerUp={() => updateSettings({ radiusKm: radius })}
              onKeyUp={() => updateSettings({ radiusKm: radius })}
              className="w-full accent-[#0b0d12]"
            />
          </div>
          <Button
            variant="light"
            className="btn-block"
            onClick={async () => {
              const areaName = await reverseArea(geo.coords.lat, geo.coords.lng);
              await updateLocation({ lat: geo.coords.lat, lng: geo.coords.lng, areaName: areaName || undefined });
              toast("home area updated");
              setShowPlace(false);
            }}
          >
            set this as my home area
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function EmptyDiscover({
  win,
  fallback,
  now,
  onWiden,
  onSeed,
  seeding,
  hasCircles,
}: {
  win: Win;
  fallback: Card[] | undefined;
  now: number;
  onWiden: () => void;
  onSeed: () => void;
  seeding: boolean;
  hasCircles: boolean;
}) {
  const later = (fallback ?? []).slice(0, 5);
  return (
    <div>
      <Empty
        emoji="🗓️"
        title={win === "now" ? "nothing on in the next couple of hours" : "nothing here yet"}
        body="so post it yourself — it takes about fifteen seconds, and people nearby get a nudge."
        action={
          <div className="flex flex-col items-center gap-2">
            <Link href="/create" className="btn btn-dark">
              post a plan
            </Link>
            {win !== "week" && (
              <button onClick={onWiden} className="text-xs font-bold text-muted underline underline-offset-4">
                or look at the whole week
              </button>
            )}
          </div>
        }
      />
      {later.length > 0 && (
        <section className="pt-2">
          <h2 className="px-1 text-2xl">coming up later</h2>
          <div className="mt-3 space-y-3">
            {later.map((p) => (
              <PlanCard key={p._id} card={p} now={now} />
            ))}
          </div>
        </section>
      )}
      {later.length === 0 && !hasCircles && process.env.NEXT_PUBLIC_ALLOW_DEMO_SEED === "true" && (
        <div className="card mt-2 p-5 text-center">
          <p className="text-sm font-bold">nothing exists around here yet.</p>
          <p className="mt-1 text-xs text-muted">this deployment has demo mode on — drop a sample neighbourhood around you to see how pap feels when a city is live.</p>
          <Button variant="light" className="mt-3" onClick={onSeed} loading={seeding}>
            🎪 load demo plans near me
          </Button>
        </div>
      )}
    </div>
  );
}

function FreeSheet({
  open,
  onClose,
  freeUntil,
  now,
  onSet,
}: {
  open: boolean;
  onClose: () => void;
  freeUntil: number | null;
  now: number;
  onSet: (minutes: number | null, note?: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="i'm free…" subtitle="we'll show you only what fits — and quietly tell your friends, nobody else.">
      <div className="space-y-4 py-2">
        {freeUntil && (
          <div className="rounded-card bg-mint p-4 text-sm font-bold">
            you're free for another {formatDuration(freeUntil - now)}.
            <button className="ml-2 underline underline-offset-2" onClick={() => onSet(null)}>
              end it
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "1 hour", m: 60 },
            { label: "2 hours", m: 120 },
            { label: "3 hours", m: 180 },
            { label: "all evening", m: 300 },
          ].map((o) => (
            <Button key={o.m} variant="light" onClick={() => onSet(o.m, note || undefined)}>
              {o.label}
            </Button>
          ))}
        </div>
        <input className="field" placeholder="optional: “up for coffee or a walk”" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} />
        <p className="text-xs leading-relaxed text-muted">
          only people you're friends with can see that you're free, and only until the timer runs out. you can turn this off in settings.
        </p>
      </div>
    </Sheet>
  );
}

