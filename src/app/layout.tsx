import type { Metadata } from "next";
import { Albert_Sans, Azeret_Mono, Libre_Caslon_Display } from "next/font/google";
import "./globals.css";

const display = Libre_Caslon_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const body = Albert_Sans({ variable: "--font-body", subsets: ["latin"] });
const tag = Azeret_Mono({ variable: "--font-tag", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Swatchless",
  description:
    "A colour-match desk for hair retailers: one customer photo, the matching fill-ins and toppers from the store's live catalogue, and the customer wearing each one before they buy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${tag.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
