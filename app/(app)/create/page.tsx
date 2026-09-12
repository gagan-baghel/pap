"use client";

import PlanForm, { type Draft } from "@/components/PlanForm";
import { errorText, useToast } from "@/components/toast";
import { TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function CreateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const editId = params.get("edit") as Id<"plans"> | null;
  const create = useMutation(api.plans.create);
  const update = useMutation(api.plans.update);
  const existing = useQuery(api.plans.get, editId ? { id: editId } : "skip");
  const circleSlug = params.get("circle");
  const circleData = useQuery(api.circles.get, circleSlug && !editId ? { slug: circleSlug } : "skip");
  // "post it again" — same plan, fresh time
  const copyId = params.get("copy");
  const source = useQuery(api.plans.get, copyId && !editId ? { id: copyId } : "skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "post it again" starts an hour from when you opened the form, rounded to a quarter hour
  const [freshStart] = useState(() => Math.ceil((Date.now() + 36e5) / 9e5) * 9e5);

  async function submit(d: Draft) {
    setBusy(true);
    setError(null);
    const payload = {
      title: d.title,
      category: d.category,
      description: d.description || undefined,
      bring: d.bring || undefined,
      requirements: d.requirements || undefined,
      placeName: d.placeName,
      areaName: d.areaName,
      lat: d.lat,
      lng: d.lng,
      exactFor: d.exactFor,
      startAt: d.startAt,
      durationMin: d.durationMin,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isNow: d.isNow,
      spots: d.spots,
      cost: d.cost,
      currency: d.currency,
      visibility: d.visibility,
      circleId: d.circleId,
      approval: d.approval,
      recurrence: d.recurrence,
    };
    try {
      if (editId) {
        await update({ id: editId, ...payload });
        toast("plan updated — everyone going was told");
        router.replace(`/p/${editId}`);
      } else {
        const id = await create(payload);
        toast("it's up 🎉");
        router.replace(`/p/${id}?new=1`);
      }
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  // PlanForm seeds its state from `initial` on mount, so never render it before the data
  // it should be seeded with has arrived — otherwise the form comes up blank.
  if ((editId && existing === undefined) || (copyId && source === undefined) || (circleSlug && circleData === undefined))
    return (
      <div className="space-y-4 p-4 pt-[calc(1.25rem+var(--sat))]">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-24 w-full rounded-card" />
        <div className="skeleton h-12 w-full rounded-full" />
        <div className="skeleton h-12 w-full rounded-full" />
      </div>
    );
  if (editId && (!existing || existing.restricted || !existing.viewer?.isHost))
    return <div className="p-6 text-sm text-muted">you can only edit plans you're hosting.</div>;

  const initial: Partial<Draft> | undefined =
    editId && existing && !existing.restricted
      ? {
          title: existing.card.title,
          category: existing.card.category,
          startAt: existing.card.startAt,
          durationMin: Math.round((existing.card.endAt - existing.card.startAt) / 60000),
          placeName: existing.raw?.placeName ?? existing.card.placeName,
          areaName: existing.card.areaName ?? undefined,
          lat: existing.raw?.lat ?? existing.card.lat,
          lng: existing.raw?.lng ?? existing.card.lng,
          exactFor: (existing.raw?.exactFor as "everyone" | "joined") ?? "everyone",
          spots: existing.card.spots,
          cost: existing.card.cost,
          currency: existing.card.currency,
          visibility: existing.card.visibility,
          circleId: existing.card.circleId ?? undefined,
          approval: existing.card.approval,
          recurrence: existing.card.recurrence ?? undefined,
          description: existing.description ?? undefined,
          bring: existing.bring ?? undefined,
          requirements: existing.requirements ?? undefined,
        }
      : source && !source.restricted && source.viewer?.isHost
        ? {
            title: source.card.title,
            category: source.card.category,
            startAt: freshStart,
            durationMin: Math.round((source.card.endAt - source.card.startAt) / 60000),
            placeName: source.raw?.placeName ?? source.card.placeName,
            areaName: source.card.areaName ?? undefined,
            lat: source.raw?.lat ?? source.card.lat,
            lng: source.raw?.lng ?? source.card.lng,
            exactFor: (source.raw?.exactFor as "everyone" | "joined") ?? "everyone",
            spots: source.card.spots,
            cost: source.card.cost,
            currency: source.card.currency,
            visibility: source.card.visibility,
            circleId: source.card.circleId ?? undefined,
            approval: source.card.approval,
            description: source.description ?? undefined,
            bring: source.bring ?? undefined,
            requirements: source.requirements ?? undefined,
          }
        : circleData?.member
        ? {
            visibility: "circle" as const,
            circleId: circleData.circle._id,
            category: circleData.circle.category,
            lat: circleData.circle.lat,
            lng: circleData.circle.lng,
            areaName: circleData.circle.areaName,
          }
        : undefined;

  return (
    <div>
      <TopBar
        title={editId ? "edit plan" : "post a plan"}
        back={true}
        sub={
          editId
            ? undefined
            : copyId
              ? "same plan, new time — change anything you like"
              : circleData?.member
                ? `a session for ${circleData.circle.name}`
                : "takes about fifteen seconds."
        }
      />
      <PlanForm
        key={editId ?? copyId ?? circleData?.circle._id ?? "new"}
        initial={initial}
        submitLabel={editId ? "save changes" : "post it"}
        onSubmit={submit}
        busy={busy}
        error={error}
      />
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">loading…</div>}>
      <CreateInner />
    </Suspense>
  );
}
