import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FoxSystems Medical CRM",
  description:
    "AI-powered Pharmaceutical & Medical Sales CRM with GPS-verified visit tracking. Built for Egyptian and GCC pharma companies.",
  applicationName: "FoxSystems Medical CRM",
  authors: [{ name: "FoxSystems Tech", url: "https://foxsystemstech.com" }],
  appleWebApp: {
    capable: true,
    title: "Fox Medical",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#14b8a6",
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
      <body>{children}</body>
    </html>
  );
}
