import { GuideDocumentPage } from "@/components/guides/guide-document-page";
import {
  PLAYTHROUGH_GUIDE_DOC_ID,
  PLAYTHROUGH_GUIDE_LOCAL_URL,
  PLAYTHROUGH_GUIDE_SECTION_OVERLAYS,
} from "@/lib/playthrough-guide";

export default function PlaythroughGuidePage() {
  return (
    <GuideDocumentPage
      title="Playthrough Guide by Jaza"
      description="Website-styled version of the community playthrough guide, kept live from the Google Doc when available."
      docId={PLAYTHROUGH_GUIDE_DOC_ID}
      docUrl={`https://docs.google.com/document/d/${PLAYTHROUGH_GUIDE_DOC_ID}/edit`}
      fallbackUrl={PLAYTHROUGH_GUIDE_LOCAL_URL}
      overlays={PLAYTHROUGH_GUIDE_SECTION_OVERLAYS}
    />
  );
}
