import { rename, writeFile } from "node:fs/promises";
import { importJazaGitBook } from "../../api-server/src/lib/jaza-gitbook-import.mjs";

const output = new URL("../src/lib/jaza-gitbook.md", import.meta.url);
const temporary = new URL(output.href + ".tmp");
const markdown = await importJazaGitBook();
await writeFile(temporary, markdown, "utf8");
await rename(temporary, output);
console.log("Imported Jaza’s GitBook guide.");
