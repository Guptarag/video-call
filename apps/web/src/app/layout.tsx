import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Private Video Call | Zero-Knowledge 1-to-1 Encrypted Calling",
  description: "End-to-end encrypted, zero-knowledge private video calling directly between two browsers via WebRTC DTLS-SRTP.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
