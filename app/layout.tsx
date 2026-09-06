import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoCaptain",
  description: "CoCaptain brings your hockey club, squad and match-day planning together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
