import ts from 'typescript';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const relative='artifacts/kingdom-adventures/src/pages/chaos-setup-lab.tsx';
// Immutable pre-redesign source: keep this check reproducible after the changes are committed.
const before=execFileSync('git',['show',`b2496463526839253bb3ce1da24335be1e566d85:${relative}`],{encoding:'utf8'});
const after=fs.readFileSync('src/lib/chaos-rules.ts','utf8');
const names=['eastFrontSpawn','stoneDirectionalBounds','getProfileTargets','cardinalStepsInRange'];
function functions(source){const file=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const out={};const printer=ts.createPrinter({removeComments:true});function walk(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))out[node.name.text]=printer.printNode(ts.EmitHint.Unspecified,node,file).replace(/^export\s+/,'').replace(/\s+/g,'');ts.forEachChild(node,walk);}walk(file);return out;}
const a=functions(before),b=functions(after);
const report=Object.fromEntries(names.map(name=>[name,{unchanged:a[name]===b[name]&&!!a[name]}]));
fs.writeFileSync('../../docs/chaos-stone-review/mechanics-preservation.json',JSON.stringify(report,null,2));
if(Object.values(report).some(result=>!result.unchanged))throw Error(JSON.stringify(report));
console.log(JSON.stringify(report));
