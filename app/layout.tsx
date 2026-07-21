import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  return (
    <html lang="en" dir="ltr">
      <body>
        {children}
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
