import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speaker Diarization POC",
  description: "Upload an audio file and review who spoke when.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
