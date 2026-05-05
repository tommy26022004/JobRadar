import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ScanProvider } from "@/lib/scan-context";
import { ScanToast } from "@/components/scan-toast";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JobRadar",
  description: "AI-powered job application tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geist.className} min-h-full bg-background text-foreground antialiased`}>
        <AuthProvider>
          <ScanProvider>
            {children}
            <ScanToast />
            <Toaster />
          </ScanProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
