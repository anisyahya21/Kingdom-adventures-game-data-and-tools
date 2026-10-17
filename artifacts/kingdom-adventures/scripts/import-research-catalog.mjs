import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('Pass the independently audited research proposal JSON');
const proposal = JSON.parse(fs.readFileSync(input, 'utf8'));
const ids = new Set(), tuples = new Set();
const options = proposal.options.map(o => {
  const tuple = [o.encounter,o.stats.att,o.stats.speed,o.stats.luck,o.stats.dex].join('/');
  if (ids.has(o.id) || tuples.has(tuple) || o.n < 200 || !o.mpProvenSufficientBothRoles || o.mpMode !== 'sufficient') throw new Error(`Invalid option ${o.id}`);
  ids.add(o.id); tuples.add(tuple);
  return {id:o.id,encounter:o.encounter,atk:o.stats.att,spd:o.stats.speed,lck:o.stats.luck,dex:o.stats.dex,
    mean:o.meanEarned,highest:o.highestEarned,median:o.median,n:o.n,seedRange:o.seedIndexRange,
    lowAtMost1:o.lowReward0to1Count,defeats:o.defeatCount,meanDpsMp:o.meanDpsMp,meanHealerMp:o.meanHealerMp,
    source:'Fixed research team · sufficient MP',status:'Exact measured stats; nearby rewards unmeasured',
    setupId:o.setupId,sourceCohort:o.sourceCohort,mpMode:o.mpMode,evidence:o.evidence};
});
const metadata = {schema:'ka-sufficient-mp-catalog-v1',createdUtc:proposal.createdUtc,fixedSetup:proposal.fixedSetup,
  rankInterpretation:proposal.rankInterpretation,selectionRule:proposal.selectionRule,
  sourcePins:{workbookSha256:proposal.sourcePins.companionWorkbook.sha256,cohorts:Object.fromEntries(Object.entries(proposal.sourcePins.cohorts).map(([id,c])=>[id,{analysisSha256:c.analysisSha256,auditSha256:c.auditSha256,seedRange:c.seedIndexRange,n:c.expectedSeedsPerTuple}]))}};
const panels = options.map(o=>({id:o.id,encounter:o.encounter,stats:[o.atk,o.spd,o.lck,o.dex],mean:o.mean,median:o.median,n:o.n,low:o.lowAtMost1,defeats:o.defeats,highest:o.highest,seedRange:o.seedRange,meanDpsMp:o.meanDpsMp,meanHealerMp:o.meanHealerMp,setupId:o.setupId,sourceCohort:o.sourceCohort,mpMode:o.mpMode,variants:[]}));
fs.writeFileSync(path.join(app,'src/game-data/chest-strategy-targets.json'),JSON.stringify({...metadata,options})+'\n');
fs.writeFileSync(path.join(app,'src/game-data/chest-strategy-boundaries.json'),JSON.stringify({...metadata,panels})+'\n');
console.log(`Imported ${options.length} exact options across ${new Set(options.map(o=>o.encounter)).size} encounters; no legacy boundaries retained.`);
