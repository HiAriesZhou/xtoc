import { XtocExperience } from "@/components/xtoc-experience";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata("clips");
export default function Page() {
  return <XtocExperience initialView="clips" />;
}
