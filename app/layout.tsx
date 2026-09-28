import type { Metadata, Viewport } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { LangProvider, type Lang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "FoxSystems Medical CRM",
  description:
    "AI-powered Pharmaceutical & Medical Sales CRM with GPS-verified visit tracking.",
  applicationName: "FoxSystems Medical CRM",
  manifest: "/manifest.json",
  authors: [{ name: "FoxSystems Tech", url: "https://foxsystemstech.com" }],
  appleWebApp: {
    capable: true,
    title: "Fox Medical",
    statusBarStyle: "default"
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: "/favicon-32.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#0a1e3f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Chosen language, so the first paint is already in the right direction.
  const lang: Lang = cookies().get("foxmed_lang")?.value /* = LANG_COOKIE in lib/i18n */ === "ar" ? "ar" : "en";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        {/* No-flash dark-mode init: set the class before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('foxmed_theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`
          }}
        />
      </head>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
        {/* Register service worker on the client */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(){});
                });
              }
            `
          }}
        />
      </body>
    </html>
  );
}
