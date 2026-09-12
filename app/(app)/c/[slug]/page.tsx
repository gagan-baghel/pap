import CircleView from "@/components/CircleView";
import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchQuery(api.circles.get, { slug }).catch(() => null);
  if (!data) return { title: "circle not found", robots: { index: false } };
  const c = data.circle;
  const title = `${c.emoji} ${c.name}`;
  const description = `${c.schedule} · ${c.areaName} · ${c.memberCount} members. ${c.description}`.slice(0, 200);
  return { title, description, openGraph: { title, description } };
}

export default async function CirclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CircleView slug={slug} />;
}
