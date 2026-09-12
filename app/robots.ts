import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/safety", "/p/"],
        // everything behind the account is private by nature
        disallow: ["/discover", "/plans", "/create", "/inbox", "/chat/", "/me", "/settings", "/admin", "/search", "/onboarding", "/signin", "/u/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
