import { lazy, Suspense, useState } from "react";
import RuntimeWorldGridTestPage from "@/pages/runtime-world-grid-test";
import RuntimeWorldRenderTestPage from "@/pages/runtime-world-render-test";
import { PageHeader } from "@/components/ka/page-header";
import { ToolHelp } from "@/components/ka/tool-help";

const TileMapPage = lazy(() => import("@/pages/world-map"));

type MapTab = "isometric" | "top";

export default function WorldMapV2Page() {
  const [activeTab, setActiveTab] = useState<MapTab>("isometric");
  const [topView, setTopView] = useState<"fields" | "tiles">("fields");
  const [showLevelsOverlay, setShowLevelsOverlay] = useState(false);

  return (
    <div className="mx-auto max-w-[2400px] px-4 py-4">
      <PageHeader title="Kingdom Adventurers World Map">
        <p>Explore terrain, area levels, facilities and resources in isometric or top view. Work in progress.</p>
      </PageHeader>
      <section aria-labelledby="map-expansion" className="mt-4 max-w-4xl rounded-lg border border-border bg-card p-4">
        <h2 id="map-expansion" className="mb-2 text-lg font-semibold">Map expansion requirements</h2>
        <p className="mb-3 text-sm text-muted-foreground">Defeat area bosses to clear fog and raise your Peace Level. Later areas also require town and collection milestones.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-semibold">59%</dt><dd>Area levels 62, 74, 76, 88, 90, 92, 135 and 142.</dd>
          <dt className="font-semibold">69%</dt><dd>Area levels 69, 85, 112, 120, 162, 208, 225, 250 and 320.</dd>
          <dt className="font-semibold">77%</dt><dd>Area levels 121, 265, 311, 360, 454, 525, 592, 624 and 777. Build 3 Town Halls.</dd>
          <dt className="font-semibold">89%</dt><dd>Area levels 888, 1020, 1100, 1600 and 3200. Build 5 Town Halls, raise one to rank 50, and have at least one child.</dd>
          <dt className="font-semibold">94%</dt><dd>Area levels 2400, 4800, 5100, 6000 and 9999. Build 5 Town Halls and raise one to rank 80. Collect 7 different kinds of insects, 7 kinds of fish, and 7 different paintings for the Insectarium, Aquarium, and Museum.</dd>
        </dl>
      </section>
      <div className="mt-3">
        <ToolHelp title="Map views and planning tools">
          <p>Switch between isometric and top-view maps. Use Show levels to check areas and the layer controls to choose which objects are visible.</p>
          <p>To plan towns, plots and indoor facilities, open the <a href="/world-builder" className="underline underline-offset-2">World Builder</a>.</p>
        </ToolHelp>
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
        {activeTab === "isometric" ? (
          <button
            type="button"
            onClick={() => setShowLevelsOverlay((previous) => !previous)}
            aria-pressed={showLevelsOverlay}
            className={`rounded border px-5 py-2 text-sm font-semibold transition-colors ${
              showLevelsOverlay
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {showLevelsOverlay ? "Hide levels" : "Show levels"}
          </button>
        ) : null}
      </div>

      {activeTab === "isometric"
        ? <RuntimeWorldRenderTestPage publicMode showLevelOverlay={showLevelsOverlay} />
        : <>
            <div className="mt-3 flex gap-2" role="group" aria-label="Top-view maps">
              <button type="button" aria-pressed={topView === "fields"} onClick={() => setTopView("fields")} className="rounded border px-4 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">F0-F5 maps</button>
              <button type="button" aria-pressed={topView === "tiles"} onClick={() => setTopView("tiles")} className="rounded border px-4 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">Tile map</button>
            </div>
            {topView === "fields" ? <RuntimeWorldGridTestPage publicMode /> : <Suspense fallback={<p>Loading map...</p>}><TileMapPage /></Suspense>}
          </>}
    </div>
  );
}
