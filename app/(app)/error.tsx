"use client";

import { Button } from "@/components/ui";
import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("pap:", error);
  }, [error]);

  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="text-5xl">🧯</div>
        <h1 className="mt-4 text-3xl">this screen broke</h1>
        <p className="mt-2 text-sm text-muted">
          nothing was lost — your plans and messages are safe on the server. try again, or head back to discover.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={reset}>try again</Button>
          <Link href="/discover" className="btn btn-light">
            back to discover
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-faint">reference: {error.digest}</p>}
      </div>
    </div>
  );
}
