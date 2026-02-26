"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface Service {
  id: string;
  name_en?: string;
  nameEn?: string;
  name_fr?: string;
  nameFr?: string;
  name_ar?: string;
  nameAr?: string;
  default_price?: number | string;
  defaultPrice?: number | string;
}

interface Provider {
  id: string;
  user?: { full_name?: string };
  full_name?: string;
}

interface Patient {
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface PlanItemForm {
  service_id: string;
  description_en: string;
  description_fr: string;
  description_ar: string;
  quantity_total: number;
  unit_price: string;
  sequence_order: number;
}

export function NewPlanClient({
  patientId,
  locale,
}: {
  patientId: string;
  locale: string;
}) {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState({
    name_en: "",
    name_fr: "",
    name_ar: "",
    provider_id: "",
    total_estimated_cost: "",
    notes: "",
  });
  const [items, setItems] = useState<PlanItemForm[]>([
    {
      service_id: "",
      description_en: "",
      description_fr: "",
      description_ar: "",
      quantity_total: 1,
      unit_price: "",
      sequence_order: 1,
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/patients/${patientId}`),
      fetch("/api/services"),
      fetch("/api/providers"),
    ]).then(async ([p, s, prov]) => {
      const pData = await p.json();
      const sData = await s.json();
      const provData = await prov.json();
      setPatient((pData.patient ?? pData) as Patient);
      const rawSvc = sData?.services ?? sData;
      setServices((Array.isArray(rawSvc) ? rawSvc : []) as Service[]);
      const rawProv = provData?.providers ?? provData;
      setProviders((Array.isArray(rawProv) ? rawProv : []) as Provider[]);
    });
  }, [patientId]);

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        service_id: "",
        description_en: "",
        description_fr: "",
        description_ar: "",
        quantity_total: 1,
        unit_price: "",
        sequence_order: prev.length + 1,
      },
    ]);
  }

  function removeItem(i: number) {
    setItems((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((item, idx) => ({ ...item, sequence_order: idx + 1 }))
    );
  }

  function updateItem(i: number, field: string, value: unknown) {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== i) return item;
        if (field === "service_id") {
          const service = services.find((s) => s.id === value);
          return {
            ...item,
            service_id: value as string,
            description_en: service?.name_en ?? "",
            description_fr: service?.name_fr ?? "",
            description_ar: service?.name_ar ?? "",
            unit_price: String(service?.default_price ?? ""),
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  const totalValue = items.reduce(
    (sum, item) =>
      sum + (Number(item.unit_price) * Number(item.quantity_total) || 0),
    0
  );

  async function handleSubmit() {
    if (!form.name_en.trim()) {
      setError("Plan name is required");
      return;
    }
    if (!form.provider_id) {
      setError("Select a provider");
      return;
    }
    if (items.some((i) => !i.description_en?.trim() || !i.unit_price)) {
      setError("Fill in all treatment items (description and price per session)");
      return;
    }
    if (items.some((i) => !i.service_id)) {
      setError("Each item must have a service selected.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patientId,
        provider_id: form.provider_id,
        name_en: form.name_en,
        name_fr: form.name_fr || form.name_en,
        name_ar: form.name_ar || form.name_en,
        notes: form.notes || null,
        total_estimated_cost: form.total_estimated_cost
          ? Number(form.total_estimated_cost)
          : null,
        items: items.map((item) => ({
          service_id: item.service_id || null,
          description_en: item.description_en,
          description_fr: item.description_fr || item.description_en,
          description_ar: item.description_ar || item.description_en,
          quantity_total: Number(item.quantity_total),
          unit_price: Number(item.unit_price),
          sequence_order: item.sequence_order,
        })),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError((data.message ?? data.error ?? "Failed to create plan.") as string);
      setLoading(false);
      return;
    }

    const data = await res.json();
    const plan = data.plan ?? data;
    router.push(`/${locale}/plans/${plan.id}`);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 inline-block" />
        Back
      </button>
      <div>
        <h1 className="text-2xl font-bold">New Treatment Plan</h1>
        {patient && (
          <p className="text-sm text-muted-foreground mt-1">
            For: {patient.first_name} {patient.last_name}
            {patient.phone && ` · ${patient.phone}`}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Plan details */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Plan Details</h2>

        <div>
          <label className="block text-sm font-medium mb-1">
            Plan Name (English) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name_en}
            onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            placeholder="e.g. Full Dental Treatment, Physiotherapy Course"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan Name (French)</label>
            <input
              type="text"
              value={form.name_fr}
              onChange={(e) => setForm((f) => ({ ...f, name_fr: e.target.value }))}
              placeholder="Optional"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plan Name (Arabic)</label>
            <input
              type="text"
              value={form.name_ar}
              onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
              placeholder="اختياري"
              dir="rtl"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Provider <span className="text-red-500">*</span>
          </label>
          <select
            value={form.provider_id}
            onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
          >
            <option value="">Select provider...</option>
            {(Array.isArray(providers) ? providers : []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.user?.full_name ?? p.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Total Estimated Cost (optional)
          </label>
          <div className="relative">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.total_estimated_cost}
              onChange={(e) =>
                setForm((f) => ({ ...f, total_estimated_cost: e.target.value }))
              }
              className="w-full rounded-lg border px-3 py-2 ps-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background resize-none"
          />
        </div>
      </div>

      {/* Treatment items */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Treatment Items</h2>

        {items.map((item, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Item {i + 1}
              </span>
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(i)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Service <span className="text-red-500">*</span>
              </label>
              <select
                value={item.service_id}
                onChange={(e) => updateItem(i, "service_id", e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none"
              >
                <option value="">Select service...</option>
                {(Array.isArray(services) ? services : []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_en ?? s.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">
                Description
              </label>
              <input
                type="text"
                value={item.description_en}
                onChange={(e) => updateItem(i, "description_en", e.target.value)}
                placeholder="Treatment description..."
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  Sessions
                </label>
                <input
                  type="number"
                  min={1}
                  value={item.quantity_total}
                  onChange={(e) =>
                    updateItem(i, "quantity_total", e.target.value)
                  }
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">
                  Price per session ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none"
                />
              </div>
            </div>

            {item.unit_price && item.quantity_total && (
              <p className="text-xs text-muted-foreground text-end">
                Subtotal: $
                {(
                  Number(item.unit_price) * Number(item.quantity_total)
                ).toFixed(2)}
              </p>
            )}
          </div>
        ))}

        <button
          onClick={addItem}
          className="text-sm text-primary hover:underline"
        >
          + Add Item
        </button>

        <div className="flex justify-between text-sm border-t pt-3">
          <span className="text-muted-foreground">Total Plan Value</span>
          <span className="font-bold">${totalValue.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="rounded-lg border px-6 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create Plan"}
        </button>
      </div>
    </div>
  );
}
