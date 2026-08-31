import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` does not connect to PostgreSQL, but Prisma still evaluates
// this config during `postinstall`. The local placeholder keeps installs and
// builds independent from a running database; migrate/seed commands must receive
// the real DATABASE_URL from the environment.
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/lauril";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
