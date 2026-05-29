import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "slops.sh",
  description: "Terminal slots for waiting on coding agents.",
  metadataBase: new URL("https://slops.sh"),
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
