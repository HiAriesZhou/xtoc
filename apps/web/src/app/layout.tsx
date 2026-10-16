import type { Metadata } from "next";
import { DM_Sans, Libre_Caslon_Display } from "next/font/google";
import "./globals.css";

const uiFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const displayFont = Libre_Caslon_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://x-toc.vercel.app"),
  title: {
    default: "XTOC | Navigate and Clip X Articles",
    template: "%s | XTOC",
  },
  description:
    "Jump between sections in long X articles, save useful passages locally, and export your clips as Markdown or JSON.",
  openGraph: {
    title: "XTOC | Navigate and Clip X Articles",
    description: "Keep article structure visible. Save useful passages locally.",
    type: "website",
    siteName: "XTOC",
    images: [{
      url: "/images/x-toc-social-1280x640.png",
      width: 1280,
      height: 640,
      type: "image/png",
      alt: "XTOC demo: navigate an article with a collapsible pinned table of contents and save selected passages locally.",
    }],
  },
  twitter: {
    card: "summary_large_image",
    images: [{
      url: "/images/x-toc-social-1280x640.png",
      alt: "XTOC demo: navigate an article with a collapsible pinned table of contents and save selected passages locally.",
    }],
    title: "XTOC | Navigate and Clip X Articles",
    description: "Keep article structure visible. Save useful passages locally.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/x-icon" href="/favicon/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
      </head>
      <body className={`${uiFont.variable} ${displayFont.variable}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org", "@type": "SoftwareApplication",
          "@id": "https://x-toc.vercel.app/#software", name: "XTOC", alternateName: "X-TOC",
          url: "https://x-toc.vercel.app/", applicationCategory: "BrowserApplication",
          softwareRequirements: "Desktop Chrome; supported X/Twitter long-form articles",
          description: "A table of contents for X Articles with local clips, tags, notes, and Markdown or JSON export.",
          downloadUrl: "https://chromewebstore.google.com/detail/nbdgpckkcfkomnmdefinikjijgljgjfp",
          sameAs: ["https://github.com/HiAriesZhou/x-toc"],
        }) }} />
        {children}
      </body>
    </html>
  );
}
