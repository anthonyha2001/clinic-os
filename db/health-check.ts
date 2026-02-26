import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local"), override: true });

async function main() {
  const { pgClient } = await import("./index");
  try {
    const result = await pgClient`SELECT NOW() AS server_time`;
    console.log(
      `✅ DB connected — server time: ${result[0].server_time}`
    );
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ DB connection failed:");
    console.error(message);
    if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
      console.error("\nTip: If the direct DB host does not resolve, use the Connection pooler URL from Supabase Dashboard → Project Settings → Database (e.g. host ending in .pooler.supabase.com:6543).");
    }
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main();
