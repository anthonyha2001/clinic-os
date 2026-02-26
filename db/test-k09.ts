import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_k09_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // Setup: create temp org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K09 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    // 1. Insert 3 payment methods with trilingual labels
    const methods = [
      { type: "cash", en: "Cash", fr: "Espèces", ar: "نقدي", order: 0 },
      { type: "card", en: "Credit Card", fr: "Carte de crédit", ar: "بطاقة ائتمان", order: 1 },
      { type: "bank_transfer", en: "Bank Transfer", fr: "Virement bancaire", ar: "تحويل بنكي", order: 2 },
    ];

    for (const m of methods) {
      await pgClient`
        INSERT INTO payment_methods (organization_id, type, label_en, label_fr, label_ar, display_order)
        VALUES (${orgId}, ${m.type}, ${m.en}, ${m.fr}, ${m.ar}, ${m.order})
      `;
    }
    console.log("✅ 3 payment methods inserted with trilingual labels");

    // 2. Verify all 3 returned ordered by display_order
    const all = await pgClient`
      SELECT type, label_en, label_fr, label_ar, is_active, display_order
      FROM payment_methods
      WHERE organization_id = ${orgId}
      ORDER BY display_order
    `;
    if (all.length !== 3) throw new Error(`Expected 3, got ${all.length}`);
    if (all[0].type !== "cash" || all[1].type !== "card" || all[2].type !== "bank_transfer") {
      throw new Error("Display order not correct");
    }
    console.log("✅ Display order respected");

    // 3. Verify trilingual labels stored correctly
    const cash = all[0];
    if (cash.label_en !== "Cash" || cash.label_fr !== "Espèces" || cash.label_ar !== "نقدي") {
      throw new Error("Trilingual labels not stored correctly");
    }
    console.log("✅ Trilingual labels correct (EN/FR/AR)");

    // 4. Test is_active toggle
    await pgClient`
      UPDATE payment_methods SET is_active = false
      WHERE organization_id = ${orgId} AND type = 'bank_transfer'
    `;
    const active = await pgClient`
      SELECT type FROM payment_methods
      WHERE organization_id = ${orgId} AND is_active = true
      ORDER BY display_order
    `;
    if (active.length !== 2) throw new Error(`Expected 2 active, got ${active.length}`);
    const activeTypes = active.map((r: any) => r.type);
    if (activeTypes.includes("bank_transfer")) throw new Error("bank_transfer should be inactive");
    console.log("✅ is_active toggle works (2 active, 1 inactive)");

    // 5. Verify org scoping — create second org, should not see first org's methods
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K09 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    const org2Methods = await pgClient`
      SELECT * FROM payment_methods WHERE organization_id = ${org2.id}
    `;
    if (org2Methods.length !== 0) throw new Error("Org2 should have 0 methods");
    console.log("✅ Org scoping correct (org2 sees nothing)");

    // Cleanup org2
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    // 6. Default is_active should be true
    if (all[0].is_active !== true) throw new Error("Default is_active should be true");
    console.log("✅ Default is_active = true");

    console.log("\n🎉 K-09 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM payment_methods WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
