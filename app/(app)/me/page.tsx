"use client";

import { useMe } from "@/components/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MePage() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me?.handle) router.replace(`/u/${me.handle}`);
  }, [me?.handle, router]);
  return <div className="p-6 text-sm text-muted">loading…</div>;
}
