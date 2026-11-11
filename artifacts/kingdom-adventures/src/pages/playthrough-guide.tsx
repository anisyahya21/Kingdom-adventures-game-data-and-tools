import { GuideDocumentPage } from "@/components/guides/guide-document-page";
import {
  PLAYTHROUGH_GUIDE_SOURCE_URL,
  PLAYTHROUGH_GUIDE_MARKDOWN,
  PLAYTHROUGH_GUIDE_SECTION_OVERLAYS,
} from "@/lib/playthrough-guide";

export default function PlaythroughGuidePage() {
  return (
    <GuideDocumentPage
      title="Kingdom Adventurers Playthrough Guide by Jaza"
      description="Progress from your first town through fog, research, marriage and surveys. Written by Jaza and sourced from GitBook."
      bundledMarkdown={PLAYTHROUGH_GUIDE_MARKDOWN}
      docUrl={PLAYTHROUGH_GUIDE_SOURCE_URL}
      sourceLabel="Open GitBook"
      overlays={PLAYTHROUGH_GUIDE_SECTION_OVERLAYS}
    />
  );
}
