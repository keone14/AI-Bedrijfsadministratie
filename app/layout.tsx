import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Bedrijfsadministratie",
  description: "Eenvoudige, controleerbare bedrijfsadministratie voor Belgische ondernemers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
