import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triune Takeoff Haldeman",
  description: "HVAC takeoff conversion tool",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
