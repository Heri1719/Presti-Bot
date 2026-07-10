import fs from "node:fs/promises";
import { pool } from "../src/db.js";

const schemaPath = new URL("../sql/schema.sql", import.meta.url);
const schema = await fs.readFile(schemaPath, "utf8");

await pool.query(schema);
await pool.end();

console.log("Migrasi database selesai.");
