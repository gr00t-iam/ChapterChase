import type { Metadata } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChapterChase",
  description: "A self-hosted reading server with automated text-to-speech.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
