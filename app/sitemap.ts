import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Only the two genuinely public pages. Plans are indexed through the links people
// share, not through a crawlable directory of who's meeting where.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: site, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${site}/safety`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];
}
