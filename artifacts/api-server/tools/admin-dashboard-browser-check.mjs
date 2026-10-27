import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(
  new URL("../../kingdom-adventures/package.json", import.meta.url),
)("playwright-core");

export async function checkBrowser(base, token, out) {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const checks = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let asAdmin = true,
      failAnalytics = false;
    await context.route("**/ka-api/**", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname.endsWith("/auth/session") ||
        url.pathname.includes("/ka/admin/")
      ) {
        if (failAnalytics && url.pathname.endsWith("/analytics"))
          return route.fulfill({
            status: 503,
            json: { error: "Fixture: analytics unavailable" },
          });
        const response = await route.fetch({
          url: base + url.pathname.replace("/ka-api", "") + url.search,
          headers: { Cookie: asAdmin ? "ka_session=" + token : "" },
        });
        return route.fulfill({ response });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto(
      process.env.ADMIN_PREVIEW_URL || "http://localhost:5186/admin",
      { waitUntil: "domcontentloaded" },
    );
    await page.getByLabel("Reporting period").waitFor({ timeout: 60000 });
    await page.getByText("Daily traffic", { exact: true }).waitFor();
    for (const label of [
      "24 hours",
      "1 week",
      "1 month",
      "3 months",
      "Lifetime",
    ])
      assert.equal(
        await page.getByRole("button", { name: label, exact: true }).count(),
        1,
      );
    await page.getByRole("button", { name: "24 hours", exact: true }).click();
    await page.getByText(/Rolling 24 hours;/).waitFor();
    checks.push("quick duration buttons include rolling 24 hours");
    await page.getByRole("button", { name: "Lifetime", exact: true }).click();
    await page.getByText(/Available since 2025-01-01/).waitFor();
    await page.getByText("2025-01-01 to", { exact: false }).waitFor();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export daily CSV" }).click(),
    ]);
    const csv = fs.readFileSync(await download.path(), "utf8");
    assert.ok(csv.includes('"2025-01-01","3","2","1"'));
    assert.ok(csv.split("\r\n").length > 365);
    checks.push(
      "all stored history beyond one year",
      "CSV contains accurate daily totals",
    );
    await page.getByLabel("Chart metric").selectOption("uniqueVisitors");
    await page.getByLabel("Search pages and tools").fill("equipment");
    assert.equal(
      await page.getByRole("link", { name: "/guides", exact: true }).count(),
      0,
    );
    await page.getByLabel("Search pages and tools").fill("");
    await page.getByRole("button", { name: "Older", exact: true }).click();
    assert.ok(
      await page
        .getByRole("button", { name: "Newer", exact: true })
        .isEnabled(),
    );
    checks.push(
      "chart metric toggle",
      "ranking search",
      "daily table pagination",
    );
    await page
      .getByRole("button", { name: "Custom dates", exact: true })
      .click();
    await page.getByLabel("From date").fill("2025-01-01");
    await page.getByLabel("To date").fill("2025-01-02");
    await page
      .getByRole("button", { name: "Apply dates", exact: true })
      .click();
    await page
      .getByRole("row", { name: "2025-01-01 3 2 1", exact: true })
      .waitFor();
    await page.locator(".recharts-line-curve").first().waitFor();
    assert.ok(
      await page
        .locator(".recharts-line-curve")
        .first()
        .evaluate((line) => getComputedStyle(line).stroke !== "none"),
    );
    checks.push("custom historical date selection");
    await page.screenshot({
      path: path.join(out, "dashboard-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(out, "dashboard-mobile.png"),
      fullPage: true,
    });
    checks.push("mobile dashboard has no page overflow");
    failAnalytics = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture: analytics unavailable" })
      .waitFor();
    assert.equal(
      await page.getByText("Registered accounts", { exact: true }).count(),
      1,
    );
    checks.push(
      "analytics failure is visible and account totals remain available",
    );
    failAnalytics = false;
    asAdmin = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Admin access required", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Reporting period").count(), 0);
    checks.push("guest cannot open dashboard");
    assert.deepEqual(errors, []);
    checks.push("no browser runtime errors");
    fs.writeFileSync(
      path.join(out, "browser-report.json"),
      JSON.stringify(
        {
          result: "PASS",
          checks,
          count: checks.length,
          backend:
            "actual server and disposable PostgreSQL; local fixture accounts",
        },
        null,
        2,
      ),
    );
    return checks;
  } finally {
    await browser.close();
  }
}
