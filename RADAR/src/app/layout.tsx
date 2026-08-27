export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { ScrollToTop } from "@/components/ScrollToTop";
import { DegradedModeBanner } from "@/components/DegradedModeBanner";
import { UsernameSync } from "@/components/UsernameSync";
import { EngineSignature } from "@/components/EngineSignature";
import { ConsoleSignature } from "@/components/ConsoleSignature";
import { AppFrame } from "@/components/AppFrame";
import { getStudioUrl } from "@/lib/studio-prefill";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Le Média Automobile — Dashboard",
  description: "Centre de contrôle pour la production de contenu automobile",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-[var(--surface-base)] text-[var(--text-primary)]">
        <ToastProvider>
          <UsernameSync />
          <Sidebar studioUrl={getStudioUrl()} />
          <ConsoleSignature />
          <AppFrame>
            <DegradedModeBanner />
            <div className="flex-1">{children}</div>
            <EngineSignature />
          </AppFrame>
          <ScrollToTop />
        </ToastProvider>
      </body>
    </html>
  );
}
