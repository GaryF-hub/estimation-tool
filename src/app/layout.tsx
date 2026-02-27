import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EstiMate - Team Estimation Tool",
  description: "Modern team estimation tool for agile planning poker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="min-h-screen bg-grid">
          <div className="fixed inset-0 bg-gradient-to-br from-emerald-950/20 via-background to-teal-950/20 pointer-events-none" />
          <div className="relative z-10">{children}</div>
        </div>
      </body>
    </html>
  );
}
