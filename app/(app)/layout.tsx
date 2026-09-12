"use client";

import Nav from "@/components/Nav";
import { useMe, useNow } from "@/components/hooks";
import { Wordmark } from "@/components/ui";
import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Plan links are shareable with the world; everything else needs an account. */
const isPublic = (path: string) => path.startsWith("/p/");

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const now = useNow(60_000);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !isPublic(path)) router.replace(`/signin?next=${encodeURIComponent(path)}`);
    else if (isAuthenticated && me && !me.onboardedAt) router.replace(`/onboarding?next=${encodeURIComponent(path)}`);
  }, [isAuthenticated, isLoading, me, path, router]);

  if (isLoading || (!isAuthenticated && !isPublic(path)))
    return (
      <div className="sky grid h-dvh place-items-center">
        <div className="animate-pulse">
          <Wordmark className="text-6xl" />
        </div>
      </div>
    );

  const fullScreen = path.startsWith("/chat/");
  return (
    <div className="haze min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        skip to content
      </a>
      {/* a paused account can still read; every write is refused, so say so up front */}
      {me?.suspendedUntil && me.suspendedUntil > now && (
        <div className="bg-[#8f1f2d] px-4 py-2 pt-[calc(0.5rem+var(--sat))] text-center text-xs font-bold text-white">
          your account is paused while we review a report — you can look around, but you can't post, join or message.{" "}
          <Link href="/safety" className="underline">
            what this means
          </Link>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-5xl">
        {isAuthenticated && <Nav hideBar={fullScreen} />}
        <main id="main" className={`min-w-0 flex-1 md:pb-10 ${fullScreen ? "" : "pb-[calc(84px+var(--sab))]"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
