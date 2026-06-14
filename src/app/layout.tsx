import type { Metadata } from "next";
import "./globals.css";
import AppLayoutWrapper from "../components/AppLayoutWrapper";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "SignalOS — Digital Signage Management",
  description:
    "Cross-platform digital signage management desktop application. Control screens, schedule content, manage playlists, and monitor analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <TooltipProvider>
          <AppLayoutWrapper>{children}</AppLayoutWrapper>
          <Toaster position="top-right" theme="dark" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
