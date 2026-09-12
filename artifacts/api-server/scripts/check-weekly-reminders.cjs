const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/event-reminders.ts'), 'utf8');
const ast = ts.createSourceFile('reminders.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['nextWeeklyConquestStart', 'notificationTimes', 'dueGraceMs', 'parseSimpleCsv',
  'parseGvizResponse', 'asText', 'asNumber', 'getWeeklyConquestLookupById', 'weeklyConquestEventIdForReminder',
  'getMonsterSpawnMetaByName', 'formatSpawnSummary', 'resolveMonsterIconPath', 'resolveMonsterIconUrl',
  'weeklyConquestDetailLines', 'notificationVisualFor', 'sendTelegramReminder']);
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name.text)).map(n => n.getText(ast)).join('\n');
const requests = [];
const context = vm.createContext({ fs, path, process: { env: { TELEGRAM_BOT_TOKEN: 'test-only' } },
  console, Date, HOUR_MS: 3600000, DAY_MS: 86400000, DEFAULT_DUE_GRACE_MS: 3600000,
  WEEKLY_ANCHOR_START: Date.parse('2026-04-05T00:00:00+09:00'), WEEKLY_ANCHOR_EVENT_ID: 18,
  REPO_ROOT: root, MONSTER_SHEET_FILE: path.join(root, 'data/Sheet csv/KA GameData - Monster.csv'),
  TERRAIN_CODE_TO_NAME: {0:'Water',1:'Ground',2:'Grass',3:'Sand',4:'Rock',5:'Volcano',6:'Snow',7:'Swamp','-1':'Special'},
  monsterSprites: JSON.parse(fs.readFileSync(path.join(root, 'artifacts/kingdom-adventures/src/game-data/monster-sprites.json'))),
  monsterSpawnMetaByNameCache: null, weeklyConquestLookupRawCache: null, weeklyConquestLookupByIdCache: new Map(),
  refreshStaticSourceIfStale: () => {}, getCachedContent: () => null,
  normalizeReturnTo: () => 'https://kingdom-adventures-community-tools.vercel.app',
  fetch: async (url, options) => { requests.push({url, payload:JSON.parse(options.body)}); return {ok:true}; },
});
vm.runInContext(ts.transpileModule(functions, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);

(async () => {
  const subscription = {definition:{type:'weekly-conquest'},offsetHours:0,mode:'one-hour-and-start'};
  const reset = Date.parse('2026-09-12T15:00:00Z');
  for (const offset of [-6, 0, 5]) {
    subscription.offsetHours = offset;
    const localReset = reset - offset * 3600000;
    for (const lateness of [-1, 0, 1, 59000, 3599999, 3600000]) {
      const times = context.notificationTimes(subscription, new Date(localReset + lateness));
      assert.equal(times.find(x => x.kind === 'start').at.getTime(), localReset, `reset retained at ${lateness}ms, offset ${offset}`);
    }
    assert.equal(context.notificationTimes(subscription, new Date(localReset + 3600001)).find(x=>x.kind==='start').at.getTime(), localReset + 7*86400000);
  }
  subscription.offsetHours = 0;
  const visual = context.notificationVisualFor(subscription, false, new Date(reset));
  assert.equal(context.weeklyConquestEventIdForReminder(subscription, false, new Date(reset)), 41);
  assert.equal(context.weeklyConquestEventIdForReminder(subscription, true, new Date(reset-3600000)), 41);
  assert.equal(visual.weeklyMonsters.length, 5);
  assert.match(visual.body, /Rewards:/);
  assert.doesNotMatch(visual.body, /Unknown|\?/);
  for (const monster of visual.weeklyMonsters) {
    assert(monster.count > 0);
    assert.match(monster.iconUrl, /\/monster-sprites\/\d+\.png$/);
    assert(fs.existsSync(path.join(root, 'artifacts/kingdom-adventures/public', new URL(monster.iconUrl).pathname)));
  }
  await context.sendTelegramReminder('test', visual.title, visual.body, 'weekly-conquest', visual.weeklyMonsters);
  assert(requests[0].url.endsWith('/sendMediaGroup'));
  assert.equal(requests[0].payload.media.length, 5);
  assert(requests[0].payload.media[0].caption.length < 1024);
  await context.sendTelegramReminder('test', 'A & <B>', 'under_score [text]', 'test');
  assert(requests[1].url.endsWith('/sendMessage'));
  assert.match(requests[1].payload.text, /A &amp; &lt;B&gt;/);
  context.fetch = async () => ({ok:false,status:400,json:async()=>({description:'photo unavailable'})});
  await assert.rejects(() => context.sendTelegramReminder('test', 'title', 'body', 'test', visual.weeklyMonsters), /400.*photo unavailable/);
  console.log('PASS: reset boundaries/offsets, cold-start data, current event, PNG assets, rewards, Telegram album and errors.');
  console.log(visual.body);
})().catch(error => { console.error(error); process.exitCode = 1; });
