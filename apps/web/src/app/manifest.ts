import type { MetadataRoute } from "next";

/** What a browser or phone shows when FlyFleet is added to a home screen: the white mark on a Night tile. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlyFleet",
    short_name: "FlyFleet",
    description: "Transportation management for trucking companies",
    start_url: "/",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#0B1220",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
