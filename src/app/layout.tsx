import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Les Coureurs",
  description: "A daily, AI-driven role-playing game.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
