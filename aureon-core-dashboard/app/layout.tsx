import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aureon Core — Smart Home Safety Hub",
  description:
    "Monitorização de temperatura, humidade e qualidade do ar. Privacy-first, local-first."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body className="bg-bg text-white antialiased">{children}</body>
    </html>
  );
}
