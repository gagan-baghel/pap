"use client";

import { Button } from "@/components/ui";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("pap:", error);
  }, [error]);

  return (
    <main className="sky grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="text-6xl">🫠</div>
        <h1 className="mt-5 text-3xl text-[#0d1d2e]">that didn't load</h1>
        <p className="mt-2 text-sm font-medium text-[#17324d]">
          something on our side broke. your plans are fine — nothing was lost.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={reset}>try again</Button>
          <Link href="/discover" className="btn btn-light">
            back to discover
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-[#2a4a6b]">reference: {error.digest}</p>}
      </div>
    </main>
  );
}
