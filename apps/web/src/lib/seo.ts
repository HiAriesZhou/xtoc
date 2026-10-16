import type { Metadata } from "next";

export const siteUrl = "https://x-toc.vercel.app";
export const viewPaths = { home: "/", article: "/article", clips: "/clips", docs: "/docs" } as const;
export const viewMeta = {
  home: { title: "XTOC | Table of Contents & Clips for X Articles", description: "XTOC adds a table of contents to X Articles. Save passages locally with tags and notes, then export your clips as Markdown or JSON." },
  article: { title: "Interactive Article Demo | XTOC", description: "Try XTOC article navigation and local clipping with a sample article." },
  clips: { title: "Saved Clips Demo | XTOC", description: "Try the XTOC Saved Clips workflow with sample content, separate from your extension data." },
  docs: { title: "How to Use XTOC | X Article TOC & Clips", description: "Learn how to open the XTOC outline, navigate X Articles, save passages locally, add tags and notes, and export Markdown or JSON." },
} as const;
export type SiteView = keyof typeof viewPaths;
export function pageMetadata(view: SiteView): Metadata {
  const { title, description } = viewMeta[view];
  return {
    title: { absolute: title }, description,
    alternates: { canonical: viewPaths[view] },
    robots: { index: view === "home" || view === "docs", follow: true },
    openGraph: { title, description, url: viewPaths[view], type: "website", siteName: "XTOC", images: [{ url: "/images/x-toc-social-1280x640.png", width: 1280, height: 640, alt: "XTOC table of contents and local clips for X Articles" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/images/x-toc-social-1280x640.png"] },
  };
}
