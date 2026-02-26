import "dotenv/config";
import { pgClient } from "./index";

// Direct import since tsx doesn't resolve @/ alias
// In production code, use: import { auditLog } from "@/lib/services/auditLog"
async function auditLog(params: {
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<void> {
  await pgClient`
    INSERT INTO audit_logs (
      organization_id, user_id, action, entity_type, entity_id, details, ip_address
    ) VALUES (
      ${params.organizationId},
      ${params.userId},
      ${params.action},
      ${params.entityType},
      ${params.entityId},
      ${params.details ? JSON.stringify(params.details) : null}::jsonb,
      ${params.ipAddress ?? null}
    )
  `;
}

async function main() {
  const testSlug = `test_k06_${Date.now()}`;
  let orgId: string | null = null;
  let userId: string | null = null;

  try {
    // Setup: create temp org + user
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K06 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    userId = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${userId}, ${orgId}, 'auditor@test.com', 'Audit Tester')
    `;

    const fakeEntityId = crypto.randomUUID();

    // 1. Insert audit log with details
    await auditLog({
      organizationId: orgId!,
      userId: userId!,
      action: "service.price_changed",
      entityType: "service",
      entityId: fakeEntityId,
      details: {
        before: { price: 100 },
        after: { price: 150 },
        reason: "Annual price adjustment",
      },
      ipAddress: "192.168.1.1",
    });
    console.log("✅ Audit entry with details inserted");

    // 2. Insert audit log without details (nullable)
    await auditLog({
      organizationId: orgId!,
      userId: userId!,
      action: "invoice.voided",
      entityType: "invoice",
      entityId: crypto.randomUUID(),
    });
    console.log("✅ Audit entry without details inserted");

    // 3. Query by org + date range
    const orgLogs = await pgClient`
      SELECT action, entity_type, created_at
      FROM audit_logs
      WHERE organization_id = ${orgId}
      AND created_at >= NOW() - INTERVAL '1 minute'
      ORDER BY created_at
    `;
    if (orgLogs.length !== 2) throw new Error(`Expected 2 logs, got ${orgLogs.length}`);
    console.log("✅ Query by org + date range returns 2 entries");

    // 4. Query by entity type + id
    const entityLogs = await pgClient`
      SELECT action, details
      FROM audit_logs
      WHERE entity_type = 'service' AND entity_id = ${fakeEntityId}
    `;
    if (entityLogs.length !== 1) throw new Error(`Expected 1 entity log, got ${entityLogs.length}`);
    console.log("✅ Query by entity_type + entity_id works");

    // 5. Verify JSONB details are stored and queryable
    const [detailLog] = entityLogs;
    const details = typeof detailLog.details === "string"
      ? JSON.parse(detailLog.details)
      : detailLog.details;
    if (details.before.price !== 100 || details.after.price !== 150) {
      throw new Error("JSONB details not stored correctly");
    }
    console.log("✅ JSONB details stored and readable:", JSON.stringify(details));

    // 6. Verify immutability — no updated_at column
    const cols = await pgClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'audit_logs' AND column_name = 'updated_at'
    `;
    if (cols.length > 0) throw new Error("audit_logs should NOT have updated_at");
    console.log("✅ No updated_at column (immutable)");

    // 7. Verify indexes exist
    const idxs = await pgClient`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'audit_logs'
      AND indexname LIKE 'audit_logs_%'
    `;
    const idxNames = idxs.map((r: any) => r.indexname);
    console.log("Indexes:", idxNames.join(", "));
    if (idxNames.length < 2) throw new Error("Expected at least 2 custom indexes");
    console.log("✅ Both query indexes exist");

    console.log("\n🎉 K-06 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM audit_logs WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
