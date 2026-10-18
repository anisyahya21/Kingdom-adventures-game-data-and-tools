import { GuideDocumentPage } from "@/components/guides/guide-document-page";
import {
  PLAYTHROUGH_GUIDE_DOC_ID,
  PLAYTHROUGH_GUIDE_LOCAL_URL,
  PLAYTHROUGH_GUIDE_SECTION_OVERLAYS,
} from "@/lib/playthrough-guide";

export default function PlaythroughGuidePage() {
  return (
    <GuideDocumentPage
      title="Kingdom Adventurers Playthrough Guide by Jaza"
      description="Progress from your first town through fog, research, marriage and surveys. Written by Jaza; refreshed from the community Google Doc when available."
      docId={PLAYTHROUGH_GUIDE_DOC_ID}
      fallbackUrl={PLAYTHROUGH_GUIDE_LOCAL_URL}
      docUrl={`https://docs.google.com/document/d/${PLAYTHROUGH_GUIDE_DOC_ID}/edit`}
      overlays={PLAYTHROUGH_GUIDE_SECTION_OVERLAYS}
    />
  );
}
