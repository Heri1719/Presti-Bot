import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

const databaseUrl = process.env.DATABASE_URL || "postgres://localhost:5432/prestibot";
const target = new URL(databaseUrl);
const database = target.pathname.slice(1);
target.pathname = "/postgres";

const client = new pg.Client({ connectionString: target.toString() });

await client.connect();
const exists = await client.query("select 1 from pg_database where datname = $1", [database]);

if (!exists.rows.length) {
  await client.query(`create database ${pg.escapeIdentifier(database)}`);
  console.log(`Database ${database} dibuat.`);
} else {
  console.log(`Database ${database} sudah ada.`);
}

await client.end();
