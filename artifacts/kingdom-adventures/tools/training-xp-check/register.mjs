import { register } from "node:module";

// Compose the established project TS/alias/JSON loader with the lookup CSV
// raw-text import required by the shared training data module.
register("../battle-setup-check/ts-loader.mjs", import.meta.url);
register("./raw-csv-loader.mjs", import.meta.url);
