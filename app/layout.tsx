import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ToastViewport } from "@/components/ui/toast";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Imperio · Servicio en mesa",
  description: "Desayunos, comida corrida y pedidos desde mesa en tiempo real",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Imperio"
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent"
  },
  openGraph: {
    title: "Imperio · Cocina de barrio",
    description: "Desayunos de 9 a 5 y comida corrida de 1 a 5.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Menú de Imperio" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Imperio · Cocina de barrio",
    description: "Desayunos de 9 a 5 y comida corrida de 1 a 5.",
    images: ["/og.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" }
  ],
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`
          }}
        />
      </head>
      <body>
        {children}
        <ToastViewport position="bottom-right" />
      </body>
    </html>
  );
}
