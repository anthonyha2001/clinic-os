/**
 * B-01b Smoke Test: Invoice API
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-b01b.ts
 * Prerequisites: dev server running with TEST_AUTH_BYPASS=true
 */
import "dotenv/config";
import { pgClient } from "./index";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function authHeaders(userId: string): Record<string, string> {
  if (process.env.TEST_AUTH_BYPASS !== "true") return {};
  return { "X-Test-User-Id": userId };
}

async function fetchJson(
  url: string,
  opts: { method?: string; body?: unknown; userId?: string } = {}
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(opts.userId ?? ""),
  };
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, data };
}

function extractSeq(invoiceNumber: string): number {
  const match = invoiceNumber.match(/-(\d+)$/);
  if (!match) return NaN;
  return Number(match[1]);
}

async function createCompletedAppointment(params: {
  patientId: string;
  providerId: string;
  serviceId: string;
  userId: string;
  startTime: string;
}) {
  const create = await fetchJson(`${BASE}/api/appointments`, {
    method: "POST",
    body: {
      patient_id: params.patientId,
      provider_id: params.providerId,
      start_time: params.startTime,
      lines: [{ service_id: params.serviceId, quantity: 1 }],
    },
  });
  if (create.status !== 201) {
    throw new Error(`Create appointment failed: ${create.status}`);
  }
  const appointmentId = (create.data as { id: string }).id;

  const confirmed = await fetchJson(`${BASE}/api/appointments/${appointmentId}/status`, {
    method: "POST",
    userId: params.userId,
    body: { status: "confirmed" },
  });
  if (confirmed.status !== 200) {
    throw new Error(`Confirm appointment failed: ${confirmed.status}`);
  }

  const completed = await fetchJson(`${BASE}/api/appointments/${appointmentId}/status`, {
    method: "POST",
    userId: params.userId,
    body: { status: "completed" },
  });
  if (completed.status !== 200) {
    throw new Error(`Complete appointment failed: ${completed.status}`);
  }

  return appointmentId;
}

async function main() {
  console.log("=== B-01b Smoke Test: Invoice API ===\n");
  let passed = 0;
  let failed = 0;

  const createdAppointmentIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = user.id as string;
  const orgId = user.organization_id as string;

  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const [service] = await pgClient`
    SELECT id, price FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!provider || !patient || !service) {
    console.log("SKIP: Missing provider/patient/service.");
    process.exit(1);
  }
  const providerId = provider.id as string;
  const patientId = patient.id as string;
  const serviceId = service.id as string;
  const servicePrice = Number(service.price);

  // Setup completed appointment for appointment-mode invoice
  let completedApptId = "";
  try {
    completedApptId = await createCompletedAppointment({
      patientId,
      providerId,
      serviceId,
      userId,
      startTime: "2026-07-01T10:00:00.000Z",
    });
    createdAppointmentIds.push(completedApptId);
  } catch (e) {
    console.log("❌ Setup completed appointment failed:", (e as Error).message);
    await cleanup(createdInvoiceIds, createdAppointmentIds);
    process.exit(1);
  }

  // 1) POST appointment_id -> 201, draft, format
  try {
    const res = await fetchJson(`${BASE}/api/invoices`, {
      method: "POST",
      userId,
      body: { appointment_id: completedApptId, notes: "from appointment" },
    });
    if (res.status !== 201) {
      throw new Error(`Expected 201, got ${res.status}`);
    }
    const invoice = res.data as {
      id: string;
      status: string;
      invoice_number: string;
      lines: unknown[];
    };
    createdInvoiceIds.push(invoice.id);
    if (invoice.status !== "draft") {
      throw new Error(`Expected draft, got ${invoice.status}`);
    }
    if (!/^INV-[A-Z0-9]{1,4}-\d{4,}$/.test(invoice.invoice_number)) {
      throw new Error(`Unexpected invoice format: ${invoice.invoice_number}`);
    }
    if (!Array.isArray(invoice.lines) || invoice.lines.length === 0) {
      throw new Error("Expected lines on created invoice");
    }
    console.log("✅ 1. appointment-mode invoice created with valid format");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) same appointment_id again -> 409
  try {
    const res = await fetchJson(`${BASE}/api/invoices`, {
      method: "POST",
      userId,
      body: { appointment_id: completedApptId },
    });
    if (res.status === 409) {
      console.log("✅ 2. duplicate appointment invoice blocked with 409");
      passed++;
    } else {
      throw new Error(`Expected 409, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) non-completed appointment -> 422
  try {
    const scheduled = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-07-01T11:00:00.000Z",
        lines: [{ service_id: serviceId, quantity: 1 }],
      },
    });
    if (scheduled.status !== 201) {
      throw new Error(`Scheduled appointment creation failed: ${scheduled.status}`);
    }
    const scheduledApptId = (scheduled.data as { id: string }).id;
    createdAppointmentIds.push(scheduledApptId);

    const res = await fetchJson(`${BASE}/api/invoices`, {
      method: "POST",
      userId,
      body: { appointment_id: scheduledApptId },
    });
    if (res.status === 422) {
      console.log("✅ 3. non-completed appointment invoicing rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) manual mode with 2 lines -> 201 and subtotal check
  let manualInvoiceId = "";
  try {
    const res = await fetchJson(`${BASE}/api/invoices`, {
      method: "POST",
      userId,
      body: {
        patient_id: patientId,
        notes: "manual",
        lines: [
          {
            service_id: serviceId,
            description_en: "Manual A",
            description_fr: "Manuel A",
            description_ar: "يدوي أ",
            quantity: 2,
            unit_price: 25,
          },
          {
            description_en: "Manual B",
            description_fr: "Manuel B",
            description_ar: "يدوي ب",
            quantity: 1,
            unit_price: 10,
          },
        ],
      },
    });
    if (res.status !== 201) {
      throw new Error(`Expected 201, got ${res.status}`);
    }
    const invoice = res.data as { id: string; subtotal: string | number; lines: Array<{ line_total: string | number }> };
    manualInvoiceId = invoice.id;
    createdInvoiceIds.push(manualInvoiceId);
    const subtotal = Number(invoice.subtotal);
    const lineSum = invoice.lines.reduce((sum, l) => sum + Number(l.line_total), 0);
    if (Math.abs(subtotal - lineSum) > 0.0001) {
      throw new Error(`Subtotal mismatch: subtotal=${subtotal}, lines=${lineSum}`);
    }
    console.log("✅ 4. manual invoice created with correct subtotal");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) manual empty lines -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices`, {
      method: "POST",
      userId,
      body: {
        patient_id: patientId,
        lines: [],
      },
    });
    if (res.status === 422) {
      console.log("✅ 5. manual empty lines rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) manual unit_price = 0 -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices`, {
      method: "POST",
      userId,
      body: {
        patient_id: patientId,
        lines: [
          {
            description_en: "Zero",
            description_fr: "Zero",
            description_ar: "صفر",
            quantity: 1,
            unit_price: 0,
          },
        ],
      },
    });
    if (res.status === 422) {
      console.log("✅ 6. manual unit_price=0 rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) concurrent same appointment -> one 201, one 409
  try {
    const concurrentApptId = await createCompletedAppointment({
      patientId,
      providerId,
      serviceId,
      userId,
      startTime: "2026-07-01T12:00:00.000Z",
    });
    createdAppointmentIds.push(concurrentApptId);

    const [r1, r2] = await Promise.all([
      fetchJson(`${BASE}/api/invoices`, {
        method: "POST",
        userId,
        body: { appointment_id: concurrentApptId },
      }),
      fetchJson(`${BASE}/api/invoices`, {
        method: "POST",
        userId,
        body: { appointment_id: concurrentApptId },
      }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    if (statuses[0] === 201 && statuses[1] === 409) {
      const success = [r1, r2].find((r) => r.status === 201);
      if (success) {
        createdInvoiceIds.push((success.data as { id: string }).id);
      }
      console.log("✅ 7. concurrent appointment invoicing yields 201 + 409");
      passed++;
    } else {
      throw new Error(`Expected [201,409], got [${statuses.join(",")}]`);
    }
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) sequential numbering across 3 invoices
  try {
    const seqResults: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetchJson(`${BASE}/api/invoices`, {
        method: "POST",
        userId,
        body: {
          patient_id: patientId,
          lines: [
            {
              description_en: `Seq ${i}`,
              description_fr: `Seq ${i}`,
              description_ar: `تسلسل ${i}`,
              quantity: 1,
              unit_price: 1 + i,
            },
          ],
        },
      });
      if (res.status !== 201) {
        throw new Error(`Invoice ${i} create failed: ${res.status}`);
      }
      const invoice = res.data as { id: string; invoice_number: string };
      createdInvoiceIds.push(invoice.id);
      seqResults.push(extractSeq(invoice.invoice_number));
    }
    if (
      !(
        Number.isFinite(seqResults[0]) &&
        seqResults[1] === seqResults[0] + 1 &&
        seqResults[2] === seqResults[1] + 1
      )
    ) {
      throw new Error(`Sequence not incremental: ${seqResults.join(", ")}`);
    }
    console.log("✅ 8. invoice numbers increment sequentially");
    passed++;
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  await cleanup(createdInvoiceIds, createdAppointmentIds);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(invoiceIds: string[], appointmentIds: string[]) {
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}`;
    await pgClient`DELETE FROM invoices WHERE id = ${invoiceId}`;
  }
  for (const apptId of appointmentIds) {
    await pgClient`DELETE FROM appointment_status_history WHERE appointment_id = ${apptId}`;
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${apptId}`;
    await pgClient`DELETE FROM appointments WHERE id = ${apptId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
