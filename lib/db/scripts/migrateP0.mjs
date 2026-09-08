import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

// Use the same database configuration as the locally running API.
dotenv.config({
  path: fileURLToPath(
    new URL("../../../artifacts/api-server/.env", import.meta.url),
  ),
  quiet: true,
});
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(
    await readFile(new URL("./migrateP0.sql", import.meta.url), "utf8"),
  );
  console.log("P0 migration completed. Existing records preserved.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
