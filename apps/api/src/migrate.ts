import { openDatabase, resolveDatabasePath } from "./database.js";

const path = resolveDatabasePath();
const db = openDatabase(path);
db.close();
console.log(`[Looper] Database migrated: ${path}`);
