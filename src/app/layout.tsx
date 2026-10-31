import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* Fuentes empaquetadas (OFL) para no depender de la red al compilar. */
const archivo = localFont({
  src: [{ path: "../fonts/archivo-var.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  display: "swap",
});

const instrument = localFont({
  src: [
    { path: "../fonts/instrument-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/instrument-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Travel Pulse",
  description: "Explora ciudades, consulta fuentes abiertas y adapta tu viaje con Travel Pulse.",
  applicationName: "Travel Pulse",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/192", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Travel Pulse", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E8EDF1" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1626" },
  ],
};

/** Aplica el tema guardado antes de pintar, para evitar el destello. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("tp-theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning className={`${archivo.variable} ${instrument.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">
        <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-page text-fg">
          {children}
        </div>
      </body>
    </html>
  );
}
