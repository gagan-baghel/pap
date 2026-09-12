import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PAP — post a plan",
    short_name: "PAP",
    description: "Post what you're doing. People nearby join.",
    start_url: "/discover",
    display: "standalone",
    background_color: "#9ec3e4",
    theme_color: "#9ec3e4",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
