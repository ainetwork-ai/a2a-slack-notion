import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "War Desk Source Shield — Beacon News",
  description:
    "A safe, sealed-hardware intake for sources who need to be heard. Built on NEAR AI Cloud TEE.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
