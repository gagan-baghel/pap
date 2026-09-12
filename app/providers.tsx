"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ToastProvider } from "@/components/toast";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { verbose: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ToastProvider>{children}</ToastProvider>
    </ConvexAuthProvider>
  );
}
