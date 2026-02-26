import "dotenv/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: false });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const pgClient =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    prepare: true,
    types: {
      date: {
        to: 1114,
        from: [1082, 1083, 1114, 1184],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = pgClient;
}

export const db = drizzle(pgClient);
export { pgClient };
