// Public collection policy shared by the browser and API. These are traffic
// indicators, not authentication or proof that the remaining clients are human.
export const ANALYTICS_HOSTS = [
  "kingdom-adventures-community-tools.vercel.app",
  "kingdom-adventures-game-data-and-tools-ma-anisyahya21s-projects.vercel.app",
];
// Use syntax supported by both JavaScript and PostgreSQL regular expressions.
// Explicit names avoid treating real device brands such as CUBOT as crawlers.
export const AUTOMATION_USER_AGENT_PATTERN =
  "ExaSearchBot|Exabot|CCBot|GoogleOther|Google-CloudVertexBot|Storebot-Google|AdsBot-Google|Mediapartners-Google|meta-externalagent|meta-externalfetcher|HeadlessChrome|HeadlessFirefox|PhantomJS|Playwright|Puppeteer|Googlebot|Google-InspectionTool|bingbot|BingPreview|DuckDuckBot|DuckAssistBot|YandexBot|YandexRenderResourcesBot|Baiduspider|Applebot|PetalBot|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Bytespider|Amazonbot|AhrefsBot|SemrushBot|MJ12bot|DotBot|DataForSeoBot|Screaming Frog|Lighthouse|PageSpeed|GTmetrix|Pingdom|UptimeRobot|Site24x7|curl/|Wget/|python-requests|python-httpx|Go-http-client|node-fetch|undici|axios/|^node$";
export function isAutomationUserAgent(value) {
  return (
    !value.trim() || new RegExp(AUTOMATION_USER_AGENT_PATTERN, "i").test(value)
  );
}
export function isAnalyticsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ANALYTICS_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}
