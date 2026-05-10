import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketing BI",
  description: "Salesforce attribution dashboards for the marketing team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
