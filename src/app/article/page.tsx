import { XtocExperience } from "@/components/xtoc-experience";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata("article");
export default function Page() {
  return <XtocExperience initialView="article" />;
}
