"use client";

import MapView from "@/components/MapView";
import { useGeo, useMe } from "@/components/hooks";
import { Button, Chip, Field, Segmented, Sheet, Spinner, Stepper, Toggle } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, category } from "@/convex/shared";
import { type Place, reverseArea, searchPlaces } from "@/lib/places";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

export type Draft = {
  title: string;
  category: string;
  startAt: number;
  durationMin: number;
  placeName: string;
  areaName?: string;
  lat: number;
  lng: number;
  exactFor: "everyone" | "joined";
  spots: number;
  cost: number;
  currency: string;
  visibility: "public" | "friends" | "circle" | "private";
  circleId?: Id<"circles">;
  approval: boolean;
  recurrence?: "weekly";
  description?: string;
  bring?: string;
  requirements?: string;
  isNow?: boolean;
};

const QUICK: { title: string; cat: string; inMin: number; dur: number; spots: number }[] = [
  { title: "creator meetup & hangout", cat: "network", inMin: 120, dur: 90, spots: 20 },
  { title: "coffee, whoever's around", cat: "coffee", inMin: 45, dur: 60, spots: 3 },
  { title: "badminton doubles", cat: "badminton", inMin: 180, dur: 90, spots: 3 },
  { title: "dinner somewhere new", cat: "food", inMin: 300, dur: 120, spots: 4 },
  { title: "evening walk + chai", cat: "explore", inMin: 120, dur: 60, spots: 5 },
  { title: "cowork for a few hours", cat: "cowork", inMin: 60, dur: 180, spots: 4 },
  { title: "5-a-side football", cat: "football", inMin: 1440, dur: 90, spots: 9 },
  { title: "movie, late show", cat: "movie", inMin: 360, dur: 150, spots: 3 },
  { title: "gym session", cat: "gym", inMin: 600, dur: 75, spots: 2 },
];

const KEYWORDS: [RegExp, string][] = [
  [/coffee|café|cafe|latte|chai/i, "coffee"],
  [/badminton|shuttle/i, "badminton"],
  [/football|5-a-side|soccer|turf/i, "football"],
  [/tennis/i, "tennis"],
  [/cycl|bike|biking|bicycle/i, "cycle"],
  [/run|jog|5k|10k|marathon/i, "run"],
  [/gym|lift|workout|leg day/i, "gym"],
  [/hike|trek|trail/i, "hike"],
  [/movie|film|cinema|show/i, "movie"],
  [/game|board game|chess|ps5|xbox/i, "gaming"],
  [/study|exam|revision|library/i, "study"],
  [/cowork|work from|laptop|deep work/i, "cowork"],
  [/gig|concert|open mic|music|jam/i, "music"],
  [/photo|camera|shoot/i, "photo"],
  [/walk|explore|wander|market/i, "explore"],
  [/beer|drinks|pub|bar|cocktail/i, "drinks"],
  [/dinner|lunch|brunch|breakfast|food|eat|ramen|dosa|pizza/i, "food"],
  [/meetup|network|founders|builders/i, "network"],
];

const guessCategory = (title: string) => KEYWORDS.find(([re]) => re.test(title))?.[1];

const toLocalInput = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const roundTo = (t: number, minutes = 15) => Math.ceil(t / (minutes * 60e3)) * minutes * 60e3;

function whenPresets(now: number) {
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const tonight = at(0, 19) > now ? at(0, 19) : at(1, 19);
  return [
    { label: "right now", t: roundTo(now + 5 * 60e3, 5), isNow: true },
    { label: "in 1 hour", t: roundTo(now + 60 * 60e3) },
    { label: "tonight 7pm", t: tonight },
    { label: "tomorrow 10am", t: at(1, 10) },
    { label: "saturday", t: at((6 - new Date(now).getDay() + 7) % 7 || 7, 10) },
  ];
}

export default function PlanForm({
  initial,
  submitLabel,
  onSubmit,
  busy,
  error,
}: {
  initial?: Partial<Draft>;
  submitLabel: string;
  onSubmit: (d: Draft) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const geo = useGeo();
  const me = useMe();
  const maxSpots = me?.verifiedHost ? 500 : 50;
  const myCircles = useQuery(api.circles.mine) ?? [];
  const [now] = useState(() => Date.now());
  const [d, setD] = useState<Draft>({
    title: "",
    category: "coffee",
    startAt: roundTo(now + 60 * 60e3),
    durationMin: 90,
    placeName: "",
    lat: geo.coords.lat,
    lng: geo.coords.lng,
    exactFor: "everyone",
    spots: 3,
    cost: 0,
    currency: "INR",
    visibility: "public",
    approval: false,
    ...initial,
  });
  const [catTouched, setCatTouched] = useState(!!initial?.category);
  const [placeQuery, setPlaceQuery] = useState(initial?.placeName ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [details, setDetails] = useState(false);
  const [customTime, setCustomTime] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  // until a place is chosen, the plan sits wherever the person actually is
  const picked = d.placeName.trim().length > 0;
  const center = picked ? { lat: d.lat, lng: d.lng } : { lat: geo.coords.lat, lng: geo.coords.lng };

  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (placeQuery.trim().length < 2 || placeQuery === d.placeName) return setResults([]);
      abort.current?.abort();
      abort.current = new AbortController();
      setSearching(true);
      try {
        setResults(await searchPlaces(placeQuery, geo.coords, abort.current.signal));
      } catch {
        /* offline or blocked — the map picker still works */
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeQuery]);

  const valid = d.title.trim().length >= 3 && d.placeName.trim().length > 0 && d.spots >= 1;
  const cat = category(d.category);

  return (
    <div className="space-y-6 px-4 py-4">
      <section>
        <textarea
          className="field field-lg display min-h-[92px] resize-none !text-[26px] !leading-tight"
          placeholder="what are you doing?"
          value={d.title}
          maxLength={80}
          autoFocus
          onChange={(e) => {
            const title = e.target.value.replace(/\n/g, "");
            const guess = catTouched ? null : guessCategory(title);
            set({ title, ...(guess ? { category: guess } : {}) });
          }}
        />
        {!d.title && (
          <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
            {QUICK.map((q) => (
              <Chip
                key={q.title}
                className="shrink-0"
                onClick={() => {
                  setCatTouched(true);
                  setCustomTime(false);
                  set({ title: q.title, category: q.cat, startAt: roundTo(now + q.inMin * 60e3), durationMin: q.dur, spots: q.spots });
                }}
              >
                <span>{category(q.cat).emoji}</span> {q.title}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="label mb-2">what kind of thing</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              on={d.category === c.key}
              className="shrink-0"
              onClick={() => {
                setCatTouched(true);
                set({ category: c.key });
              }}
            >
              <span>{c.emoji}</span> {c.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <p className="label mb-2">when</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {whenPresets(now).map((p) => (
            <Chip
              key={p.label}
              on={!customTime && Math.abs(d.startAt - p.t) < 60e3}
              className="shrink-0"
              onClick={() => {
                setCustomTime(false);
                set({ startAt: p.t, isNow: !!p.isNow });
              }}
            >
              {p.label}
            </Chip>
          ))}
          <Chip on={customTime} className="shrink-0" onClick={() => setCustomTime(true)}>
            pick a time
          </Chip>
        </div>
        {customTime && (
          <input
            type="datetime-local"
            className="field mt-2"
            value={toLocalInput(d.startAt)}
            min={toLocalInput(now - 15 * 60e3)}
            onChange={(e) => set({ startAt: new Date(e.target.value).getTime(), isNow: false })}
          />
        )}
        <p className="label mb-2 mt-4">for how long</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {[30, 60, 90, 120, 180, 360].map((m) => (
            <Chip key={m} on={d.durationMin === m} className="shrink-0" onClick={() => set({ durationMin: m })}>
              {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <p className="label mb-2">where</p>
        <div className="relative">
          <input
            className="field"
            placeholder="search a café, park, court…"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
          />
          {searching && <Spinner className="absolute right-4 top-4" />}
          {results.length > 0 && (
            <ul className="card absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto p-1">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    className="w-full rounded-2xl px-3 py-2.5 text-left hover:bg-black/5"
                    onClick={() => {
                      set({ placeName: r.name, areaName: r.area || undefined, lat: r.lat, lng: r.lng });
                      setPlaceQuery(r.name);
                      setResults([]);
                    }}
                  >
                    <span className="block text-sm font-bold">{r.name}</span>
                    <span className="block text-xs text-muted">{r.area}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            variant="light"
            size="sm"
            onClick={async () => {
              const here = await geo.locate();
              if (!here) return;
              set({ lat: here.lat, lng: here.lng });
              const area = await reverseArea(here.lat, here.lng);
              if (area) {
                set({ areaName: area, placeName: d.placeName || `around ${area}` });
                setPlaceQuery((p) => p || `around ${area}`);
              }
            }}
          >
            📍 right where i am
          </Button>
          <Button variant="light" size="sm" onClick={() => setPicking(true)}>
            🗺️ drop a pin
          </Button>
        </div>
        <div className="mt-3 overflow-hidden rounded-card">
          <MapView center={center} zoom={15} points={[{ id: "x", ...center, emoji: cat.emoji }]} showMe={false} className="h-36 w-full" />
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <span>
            <span className="block font-extrabold tracking-tight">how many can join</span>
            <span className="text-xs text-muted">not counting you</span>
            {me?.verifiedHost && <span className="block text-[11px] font-semibold text-[#2f8f5b]">⭐ verified creator (up to 500)</span>}
          </span>
          <Stepper value={d.spots} onChange={(spots) => set({ spots })} min={1} max={maxSpots} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <span>
            <span className="block font-extrabold tracking-tight">rough cost each</span>
            <span className="text-xs text-muted">just so nobody's surprised</span>
          </span>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-muted">₹</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="field w-24 !py-2 text-right"
              value={d.cost || ""}
              placeholder="0"
              onChange={(e) => set({ cost: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        </div>
      </section>

      <section>
        <p className="label mb-2">who can see it</p>
        <Segmented
          value={d.visibility}
          onChange={(visibility) => set({ visibility, circleId: visibility === "circle" ? d.circleId ?? myCircles[0]?._id : undefined })}
          options={[
            { value: "public", label: "anyone" },
            { value: "friends", label: "friends" },
            ...(myCircles.length ? [{ value: "circle" as const, label: "circle" }] : []),
            { value: "private", label: "link only" },
          ]}
        />
        {d.visibility === "circle" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {myCircles.map((c) => (
              <Chip key={c._id} on={d.circleId === c._id} onClick={() => set({ circleId: c._id })}>
                {c.emoji} {c.name}
              </Chip>
            ))}
          </div>
        )}
        <p className="mt-2 px-1 text-xs text-muted">
          {d.visibility === "public"
            ? "anyone nearby can find this and join."
            : d.visibility === "friends"
              ? "only people you're friends with (you follow each other) will see it."
              : d.visibility === "circle"
                ? "shown to everyone in that circle."
                : "hidden from discovery — only people you send the link to can open it."}
        </p>
      </section>

      <section className="card px-4 py-1">
        <button className="flex w-full items-center justify-between py-3 text-left font-extrabold tracking-tight" onClick={() => setDetails(!details)}>
          more details <span className="text-muted">{details ? "−" : "+"}</span>
        </button>
        {details && (
          <div className="space-y-3 pb-4">
            <Field label="what's the plan, in a line or two">
              <textarea
                className="field min-h-[84px] resize-none"
                placeholder="booked court 3 for 90 minutes. casual doubles, all levels."
                maxLength={1500}
                value={d.description ?? ""}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="anything to bring">
              <input className="field" placeholder="a racket if you have one" maxLength={200} value={d.bring ?? ""} onChange={(e) => set({ bring: e.target.value })} />
            </Field>
            <Field label="anything people should know before joining">
              <input className="field" placeholder="be on time — we can't hold the table" maxLength={200} value={d.requirements ?? ""} onChange={(e) => set({ requirements: e.target.value })} />
            </Field>
            <Toggle checked={d.approval} onChange={(approval) => set({ approval })} label="approve people before they're in" hint="good for bigger or more personal plans. you'll get a request instead of an instant join." />
            <Toggle
              checked={d.exactFor === "joined"}
              onChange={(on) => set({ exactFor: on ? "joined" : "everyone" })}
              label="hide the exact spot until someone joins"
              hint="people see the neighbourhood on the map, and the precise meeting point once they're in."
            />
            <Toggle checked={d.recurrence === "weekly"} onChange={(on) => set({ recurrence: on ? "weekly" : undefined })} label="repeat every week" hint="when this one ends, next week's is posted automatically and everyone who came gets a nudge." />
          </div>
        )}
      </section>

      {error && <p className="rounded-card bg-blush px-4 py-3 text-sm font-semibold text-[#8f1f2d]">{error}</p>}

      <div className="sticky bottom-[calc(84px+var(--sab))] z-20 md:bottom-4">
        <Button
          size="lg"
          className="btn-block shadow-lift"
          disabled={!valid}
          loading={busy}
          onClick={() => onSubmit({ ...d, ...center, placeName: d.placeName || placeQuery })}
        >
          {submitLabel}
        </Button>
      </div>

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title="drag the map"
        subtitle="put the pin exactly where people should meet."
        footer={
          <Button className="btn-block" onClick={() => setPicking(false)}>
            use this spot
          </Button>
        }
      >
        <div className="overflow-hidden rounded-card">
          <MapView center={center} zoom={16} pickMode showMe={false} onCenterChange={(c) => set({ lat: c.lat, lng: c.lng })} className="h-[46dvh] w-full" />
        </div>
        <input
          className="field mt-3"
          placeholder="what should we call this spot?"
          value={placeQuery}
          onChange={(e) => {
            setPlaceQuery(e.target.value);
            set({ placeName: e.target.value });
          }}
        />
      </Sheet>
    </div>
  );
}
