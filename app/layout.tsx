import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proof of Handshake | Onchain Deposit Arbitration",
  description: "The first onchain arbitrator for rental deposit disputes. 5 AI validators read both sides and reach consensus on a transparent, tamper-proof verdict.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
