import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query("begin");
  await client.query(
    "select pg_advisory_xact_lock(hashtext('canonical-turkish-phone-migration'))",
  );

  const invalidLegacyPhones = await client.query(`
    select id
    from users
    where phone is not null
      and phone !~ '^0?5[0-9]{9}$'
    limit 1
  `);

  if (invalidLegacyPhones.rowCount > 0) {
    throw new Error(
      "Migration stopped: users contains a phone outside the supported 10/11-digit formats",
    );
  }

  const collisions = await client.query(`
    select
      case
        when phone ~ '^05[0-9]{9}$' then substring(phone from 2)
        else phone
      end as canonical_phone
    from users
    where phone is not null
    group by canonical_phone
    having count(*) > 1
    limit 1
  `);

  if (collisions.rowCount > 0) {
    throw new Error(
      "Migration stopped: removing a leading zero would create a duplicate phone",
    );
  }

  const migration = await client.query(`
    update users
    set phone = substring(phone from 2)
    where phone ~ '^05[0-9]{9}$'
  `);

  const invalidCanonicalPhones = await client.query(`
    select id
    from users
    where phone is not null
      and phone !~ '^5[0-9]{9}$'
    limit 1
  `);

  if (invalidCanonicalPhones.rowCount > 0) {
    throw new Error(
      "Migration stopped: canonical phone validation failed after update",
    );
  }

  await client.query("commit");
  console.log(`Canonicalized ${migration.rowCount ?? 0} phone number(s).`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
