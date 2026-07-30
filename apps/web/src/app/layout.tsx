import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Console",
  description: "Pilotage d'un runtime Hermes : agents, missions, résultats.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Requis pour que env(safe-area-inset-*) fonctionne sur iOS.
  // Pas de maximum-scale : le pinch-to-zoom reste accessible.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fefefe" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className="antialiased"
    >
      <head>
        {/*
          Applique le theme avant le premier paint pour eviter le flash clair.
          Inline volontairement : tout chargement differe produirait un FOUC.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("hermes-theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      {/* min-h-dvh, jamais 100vh : la barre d'URL mobile casserait la hauteur */}
      <body className="min-h-dvh bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
