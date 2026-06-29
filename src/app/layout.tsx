import type { Metadata } from "next";
import "./globals.css";
import AppLayoutWrapper from "../components/AppLayoutWrapper";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "../components/ThemeProvider";
import { APP_LOGO, APP_TITLE } from "@/lib/branding";

export const metadata: Metadata = {
  title: APP_TITLE,
  description:
    "Cross-platform digital signage management desktop application. Control screens, schedule content, and manage playlists.",
  icons: {
    icon: APP_LOGO,
    shortcut: APP_LOGO,
    apple: APP_LOGO,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark">
          <TooltipProvider>
            <AppLayoutWrapper>{children}</AppLayoutWrapper>
            <Toaster position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
