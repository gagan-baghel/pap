import PlanView from "@/components/PlanView";
import { api } from "@/convex/_generated/api";
import { category, formatWhen } from "@/convex/shared";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";

async function getPlan(id: string) {
  try {
    return await fetchQuery(api.plans.get, { id });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getPlan(id);
  if (!data) return { title: "plan not found" };
  const c = data.card;
  const when = formatWhen(c.startAt, Date.now(), c.tz ?? undefined);
  const title = `${category(c.category).emoji} ${c.title}`;
  const description = data.restricted
    ? `${c.host?.name} is hosting something on PAP.`
    : `${when} · ${c.placeName} · ${c.spots - c.goingCount > 0 ? `${c.spots - c.goingCount} spots left` : "full"}. join on PAP.`;
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">loading…</div>}>
      <PlanView id={id} />
    </Suspense>
  );
}
