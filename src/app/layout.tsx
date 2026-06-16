import type { Metadata } from "next";
import "./globals.css";
import AppLayoutWrapper from "../components/AppLayoutWrapper";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "../components/ThemeProvider";

export const metadata: Metadata = {
  title: "SignalOS — Digital Signage Management",
  description:
    "Cross-platform digital signage management desktop application. Control screens, schedule content, manage playlists, and display live data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider>
            <AppLayoutWrapper>{children}</AppLayoutWrapper>
            <Toaster position="top-right" theme="dark" richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
