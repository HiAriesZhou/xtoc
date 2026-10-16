import { XtocExperience } from "@/components/xtoc-experience";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata("docs");
export default function Page() {
  return <XtocExperience initialView="docs" />;
}
