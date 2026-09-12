// Place lookup via Photon (komoot's OSM geocoder): free, keyless, CORS-friendly and
// built for autocomplete. Swap the two functions below for a paid geocoder at scale.

export type Place = { name: string; area: string; lat: number; lng: number };

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

const label = (p: Record<string, string | undefined>) =>
  [p.name, p.street && p.name !== p.street ? p.street : null].filter(Boolean).join(", ");
const areaOf = (p: Record<string, string | undefined>) => p.district || p.locality || p.city || p.county || p.state || "";

export async function searchPlaces(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lng));
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("place search failed");
  const data: { features: Feature[] } = await res.json();
  return data.features
    .filter((f) => f.properties.name)
    .map((f) => ({
      name: label(f.properties),
      area: areaOf(f.properties),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
}

export async function reverseArea(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
    const data: { features: Feature[] } = await res.json();
    const p = data.features[0]?.properties;
    return p ? areaOf(p) || p.city || "" : "";
  } catch {
    return "";
  }
}
