import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "./_components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ROM · Painel de Contatos",
  description:
    "Frente de caixa do ROM Club: contatos por WhatsApp, Telegram e Avec, centralizados num painel de KPIs.",
  applicationName: "ROM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ROM",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0908",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Container mobile-first: largura de celular, centralizado em telas maiores */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
