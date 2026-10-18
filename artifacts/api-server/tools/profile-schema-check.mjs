import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import crypto from 'node:crypto';
const require=createRequire(import.meta.url);const {build}=require('esbuild');const {Client}=createRequire(new URL('../../../lib/db/package.json',import.meta.url))('pg');
const c=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'KingdomAdventurersProfilePreview/connection.json')));
const options={host:'127.0.0.1',port:c.port,user:'profile_preview',password:c.password,database:'postgres'};
const admin=new Client(options);await admin.connect();const name='profile_migration_check_'+crypto.randomBytes(6).toString('hex');
const out=path.resolve('dist/profile-schema-check.mjs');let db,mod;
try{
 await admin.query(`CREATE DATABASE ${name}`);db=new Client({...options,database:name});await db.connect();
 await db.query("CREATE TABLE users(id uuid PRIMARY KEY,telegram_user_id text NOT NULL,display_name text); CREATE TABLE user_sessions(id uuid PRIMARY KEY,user_id uuid,session_token_hash text,expires_at timestamptz,revoked_at timestamptz)");
 await db.query("INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001','original-telegram','Original user'); INSERT INTO user_sessions VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','unchanged-hash',now()+interval '30 days',null)");
 const original=(await db.query('SELECT row_to_json(s) AS row FROM user_sessions s')).rows;
 await build({stdin:{contents:'export {ensureProfileSchema} from "./src/lib/profile-schema.ts"; export {pool} from "@workspace/db";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:out,loader:{'.sql':'text'},external:['pg-native'],banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'}});
 process.env.DATABASE_URL=`postgresql://profile_preview:${c.password}@127.0.0.1:${c.port}/${name}`;
 mod=await import(pathToFileURL(out).href);await mod.ensureProfileSchema();await mod.ensureProfileSchema();
 const rows=(await db.query('SELECT row_to_json(s) AS row FROM user_sessions s')).rows;
 if(JSON.stringify(rows)!==JSON.stringify(original))throw Error('Session changed');
 const user=(await db.query('SELECT * FROM users')).rows[0];
 if(user.telegram_user_id!=='original-telegram'||user.display_name!=='Original user'||user.discord_user_id!==null||user.game_accounts!==null)throw Error('User changed');
 console.log(JSON.stringify({ok:true,migrationApplied:true,repeatable:true,originalUserPreserved:true,originalSessionPreserved:true,database:'disposable-local-only'}));
}finally{await mod?.pool.end();await db?.end();await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();if(fs.existsSync(out))fs.unlinkSync(out);}