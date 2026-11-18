import type { MetadataRoute } from "next"

// Installable App (PWA): opens standalone from the home screen straight into the App.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "roots",
    short_name: "roots",
    description: "roots – Verein, Events, Shop und Team an einem Ort",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#18181b",
    theme_color: "#18181b",
    lang: "de",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
