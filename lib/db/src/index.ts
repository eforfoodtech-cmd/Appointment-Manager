// import { drizzle } from "drizzle-orm/node-postgres";
// import pg from "pg";
// import * as schema from "./schema";
// import path from "node:path";
// import dotenv from "dotenv";


// const { Pool } = pg;
// // const currentDir =path.dirname(fileURLToPath(import.meta.url));
// // dotenv.config({path: path.resolve(currentDir, "../.env")});

// dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// if (!process.env.DATABASE_URL) {
//   throw new Error    (
//     "DATABASE_URL must be set. Did you forget to provision a database?",
//   );
// }

// export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// export const db = drizzle(pool, { schema });

// export * from "./schema";
//old version



import { drizzle } from "drizzle-orm/node-postgres";
import pg, { Result } from "pg";
import * as schema from "./schema";
import path from "node:path";
import dotenv from "dotenv";



dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// console.log("database urll",process.env.DATABASE_URL);
// console.log("HELLO FROM DB");
// console.log("cwd:", process.cwd());
// console.log("DATABASE_URL:", process.env.DATABASE_URL);

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
