"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, X } from "lucide-react";
import { useCurrency } from "@/lib/context/CurrencyContext";

interface Service {
  id: string;
  name_en?: string;
  nameEn?: string;
  name_fr?: string;
  nameFr?: string;
  name_ar?: string;
  nameAr?: string;
  default_price?: string | number;
  defaultPrice?: string | number;
}

interface PatientOption {
  id: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  phone: string;
}

interface LineRow {
  service_id: string;
  description_en: string;
  description_fr: string;
  description_ar: string;
  quantity: number;
  unit_price: string;
}

export function NewInvoiceClient({
  locale,
  prefillPatientId,
  prefillPatientName,
  onSuccess,
}: {
  locale: string;
  prefillPatientId?: string;
  prefillPatientName?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { format } = useCurrency();
  const [services, setServices] = useState<Service[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    prefillPatientId && prefillPatientName
      ? {
          id: prefillPatientId,
          first_name: prefillPatientName.split(" ")[0] ?? "",
          last_name: prefillPatientName.split(" ").slice(1).join(" ") ?? "",
          phone: "",
        }
      : null
  );
  const [lines, setLines] = useState<LineRow[]>([
    {
      service_id: "",
      description_en: "",
      description_fr: "",
      description_ar: "",
      quantity: 1,
      unit_price: "",
    },
  ]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/services", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d) ? d : d?.services ?? d;
        setServices(Array.isArray(raw) ? raw : []);
      });
  }, []);

  useEffect(() => {
    if (patientSearch.length < 2 && !prefillPatientId) {
      setPatients([]);
      return;
    }
    if (prefillPatientId) return;
    const timer = setTimeout(() => {
      fetch(
        `/api/patients?search=${encodeURIComponent(patientSearch)}&limit=20`,
        { credentials: "include" }
      )
        .then((r) => r.json())
        .then((data) =>
          setPatients(data.patients ?? (Array.isArray(data) ? data : []))
        );
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch, prefillPatientId]);

  function addLine() {
    setLines((l) => [
      ...l,
      {
        service_id: "",
        description_en: "",
        description_fr: "",
        description_ar: "",
        quantity: 1,
        unit_price: "",
      },
    ]);
  }

  function removeLine(i: number) {
    setLines((l) => l.filter((_, idx) => idx !== i));
  }

  function updateLine(
    i: number,
    field: keyof LineRow,
    value: string | number
  ) {
    setLines((l) =>
      l.map((line, idx) => {
        if (idx !== i) return line;
        if (field === "service_id") {
          const service = services.find((s) => s.id === value);
          const nameEn =
            service?.name_en ?? service?.nameEn ?? "";
          const nameFr =
            service?.name_fr ?? service?.nameFr ?? nameEn;
          const nameAr =
            service?.name_ar ?? service?.nameAr ?? nameEn;
          const price =
            service?.default_price ??
            service?.defaultPrice ??
            "";
          return {
            ...line,
            service_id: value as string,
            description_en: nameEn,
            description_fr: nameFr,
            description_ar: nameAr,
            unit_price: String(price),
          };
        }
        return { ...line, [field]: value };
      })
    );
  }

  const subtotal = lines.reduce(
    (sum, l) => sum + (Number(l.unit_price) * Number(l.quantity) || 0),
    0
  );

  async function handleSubmit() {
    if (!selectedPatient) {
      setError("Select a patient");
      return;
    }
    if (
      lines.some(
        (l) => !l.description_en?.trim() || l.unit_price === "" || Number(l.unit_price) <= 0
      )
    ) {
      setError("Fill in all line items (description and price)");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: selectedPatient.id,
        notes: notes || null,
        lines: lines.map((l) => ({
          service_id: l.service_id || null,
          description_en: l.description_en,
          description_fr: l.description_fr || l.description_en,
          description_ar: l.description_ar || l.description_en,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        })),
      }),
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? data.message ?? "Failed to create invoice.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    const inv = data.invoice ?? data;
    if (onSuccess) {
      onSuccess();
    } else {
      router.push(`/billing/${inv.id}`);
    }
  }

  const patientName = (p: PatientOption) =>
    `${p.first_name ?? p.firstName ?? ""} ${p.last_name ?? p.lastName ?? ""}`.trim();

  return (
    <div className="max-w-3xl space-y-6">
      {!onSuccess && (
        <>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4 inline-block" />
            Back
          </button>
          <h1 className="text-2xl font-bold">New Invoice</h1>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Patient */}
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Patient</h2>
        {selectedPatient ? (
          <div className="flex items-center justify-between rounded-lg border bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              {patientName(selectedPatient)} — {selectedPatient.phone}
            </span>
            <button
              type="button"
              onClick={() => setSelectedPatient(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              placeholder="Search patient by name or phone..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {patients.length > 0 && (
              <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
                {patients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatient(p);
                      setPatients([]);
                      setPatientSearch("");
                    }}
                    className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {patientName(p)} — {p.phone}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Line Items</h2>
        {lines.map((line, i) => (
          <div
            key={i}
            className="grid grid-cols-12 items-start gap-3"
          >
            <div className="col-span-4">
              <select
                value={line.service_id}
                onChange={(e) => updateLine(i, "service_id", e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Manual entry...</option>
                {(Array.isArray(services) ? services : []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_en ?? s.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-4">
              <input
                type="text"
                placeholder="Description"
                value={line.description_en}
                onChange={(e) =>
                  updateLine(i, "description_en", e.target.value)
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="col-span-1">
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) =>
                  updateLine(i, "quantity", e.target.value)
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="col-span-2">
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Price"
                value={line.unit_price}
                onChange={(e) =>
                  updateLine(i, "unit_price", e.target.value)
                }
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="col-span-1 flex items-center justify-end">
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-lg text-red-500 transition-colors hover:text-red-700"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addLine}
          className="text-sm text-primary underline transition-colors hover:no-underline"
        >
          + Add Line
        </button>

        <div className="flex justify-end border-t pt-3">
          <div className="text-end text-sm">
            <div className="flex justify-between gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{format(subtotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Notes (optional)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Any additional notes..."
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border px-6 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create Invoice"}
        </button>
      </div>
    </div>
  );
}
