import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "fyp",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "123456",
};

const client = new Client(config);

try {
  await client.connect();

  const dbInfo = await client.query(
    "SELECT current_database() AS database_name, current_user AS db_user"
  );
  const info = dbInfo.rows[0];

  console.log("Database connection successful.");
  console.log(`Database: ${info.database_name}`);
  console.log(`User: ${info.db_user}`);

  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  if (tablesResult.rows.length === 0) {
    console.log("No tables found in public schema.");
    process.exit(0);
  }

  console.log("\nTables and row counts:");
  for (const row of tablesResult.rows) {
    const tableName = row.table_name;
    const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM "${tableName}"`);
    console.log(`- ${tableName}: ${countResult.rows[0].count} rows`);
  }
} catch (error) {
  console.error("Database connection check failed.");
  console.error(error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
