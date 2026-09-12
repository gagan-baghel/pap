import { api } from "@/convex/_generated/api";
import { category, formatCost, formatWhen } from "@/convex/shared";
import { fetchQuery } from "convex/nextjs";
import { ImageResponse } from "next/og";

export const alt = "a plan on PAP";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchQuery(api.plans.get, { id }).catch(() => null);
  const c = data?.card;
  const cat = category(c?.category ?? "other");
  const when = c ? formatWhen(c.startAt, Date.now(), c.tz ?? undefined) : "";
  const left = c ? c.spots - c.goingCount : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(150deg, #7ea9d4 0%, #a9c9e8 45%, #e6eff7 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 96, height: 96, borderRadius: 28, background: cat.tint, alignItems: "center", justifyContent: "center", fontSize: 54 }}>
            {cat.emoji}
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#17324d" }}>{c ? when : "on PAP"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#0b0d12", lineHeight: 1.05 }}>
            {c?.title ?? "post a plan. people show up."}
          </div>
          {c && (
            <div style={{ display: "flex", fontSize: 34, color: "#1c3a58" }}>
              {c.placeName} · {formatCost(c.cost, c.currency)} · {left > 0 ? `${left} spots left` : "full"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#17324d" }}>
            {c?.host?.name ? `hosted by ${c.host.name}` : "social for things you actually do"}
          </div>
          <div style={{ display: "flex", background: "#0b0d12", color: "#fff", padding: "16px 34px", borderRadius: 999, fontSize: 30, fontWeight: 800 }}>
            join on pap
          </div>
        </div>
      </div>
    ),
    size,
  );
}
