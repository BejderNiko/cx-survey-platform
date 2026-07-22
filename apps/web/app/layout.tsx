import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OK · CX-platform",
  description: "OK's interne platform til panel, undersøgelser, kundeoplevelse og analyse",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
