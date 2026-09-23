import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Modak } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const wordmark = Modak({ subsets: ["latin"], weight: "400", variable: "--font-wordmark", display: "swap" });

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "PAP — post a plan", template: "%s · PAP" },
  description:
    "PAP is where you post what you're actually doing — badminton at 7, coffee in 20 minutes, dinner on saturday — and people nearby join. See it, join it, go.",
  applicationName: "PAP",
  appleWebApp: { capable: true, title: "PAP", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "PAP",
    title: "PAP — post a plan",
    description: "Stop asking “anyone free tonight?”. Post the plan. People join.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#9ec3e4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${wordmark.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
