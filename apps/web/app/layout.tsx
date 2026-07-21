import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OK CX Survey Platform",
  description: "Internal survey, panel, CX, and analysis platform for OK",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
