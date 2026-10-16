import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/docs", "/privacy"].map(path => ({ url: `${siteUrl}${path}` }));
}
