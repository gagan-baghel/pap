import ProfileView from "@/components/ProfileView";
import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";

// Profiles are shared person-to-person, so they get real link previews — but they stay
// out of search engines (see app/robots.ts). Who meets whom is nobody else's business.
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = await fetchQuery(api.users.profile, { handle }).catch(() => null);
  if (!profile) return { title: "profile not found", robots: { index: false, follow: false } };
  const title = `${profile.user.name} (@${profile.user.handle})`;
  const bits = [profile.areaName, `${profile.attended} plans done`, profile.hosted ? `${profile.hosted} hosted` : null].filter(Boolean);
  const description = profile.bio || `${bits.join(" · ")} on PAP.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "profile" },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <ProfileView handle={handle} />;
}
