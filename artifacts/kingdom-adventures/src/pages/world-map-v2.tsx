import { useState } from "react";
import RuntimeWorldGridTestPage from "@/pages/runtime-world-grid-test";
import RuntimeWorldRenderTestPage from "@/pages/runtime-world-render-test";

type MapTab = "isometric" | "top";

export default function WorldMapV2Page() {
  const [activeTab, setActiveTab] = useState<MapTab>("isometric");

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4">
      <div className="text-xs leading-relaxed text-muted-foreground">
        work in progress...
        <br />
        Map with full terrain, facility locations, resource spawns and map chip.
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("isometric")}
          className={`rounded border px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === "isometric" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
          }`}
        >
          Isometric map
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("top")}
          className={`rounded border px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === "top" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
          }`}
        >
          Top-view map
        </button>
      </div>

      {activeTab === "isometric" ? <RuntimeWorldRenderTestPage publicMode /> : <RuntimeWorldGridTestPage publicMode />}
    </div>
  );
}
