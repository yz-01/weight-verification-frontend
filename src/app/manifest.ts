import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MSE Trace",
    short_name: "MSE Trace",
    description: "Verified construction material and recycling records.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafb",
    theme_color: "#087f8c",
    orientation: "any",
    icons: [
      {
        src: "/mse-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/mse-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
