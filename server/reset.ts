import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { spawn } from "child_process";

async function reset() {
  console.log("🔄 Resetting database...");

  try {
    console.log("🗑️  Dropping all tables...");

    await db.execute(sql`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
    `);

    console.log("✅ All tables dropped");

    console.log("📋 Running database migration...");
    const migrate = spawn("pnpm", ["run", "db:migrate"], {
      stdio: "inherit",
      shell: true,
    });

    migrate.on("close", (code) => {
      if (code !== 0) {
        console.error("\n❌ Migration failed");
        process.exit(1);
      }

      console.log("\n✅ Migration completed, running seed...");
      const seed = spawn("tsx", ["server/seed.ts"], {
        stdio: "inherit",
      });

      seed.on("close", (code) => {
        if (code === 0) {
          console.log("\n✅ Reset and reseed completed successfully!");
          process.exit(0);
        } else {
          console.error("\n❌ Seed failed");
          process.exit(1);
        }
      });
    });
  } catch (error) {
    console.error("❌ Reset failed:", error);
    process.exit(1);
  }
}

reset();
