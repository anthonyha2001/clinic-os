"use client";

import { useCurrency } from "@/lib/context/CurrencyContext";
import { useState, useEffect } from "react";
import { X } from "lucide-react";

type Service = {
  id: string;
  name_en?: string;
  nameEn?: string;
  name_fr?: string;
  name_ar?: string;
  default_price?: number | string;
  defaultPrice?: number | string;
};
type Provider = {
  id: string;
  user?: { full_name?: string };
  full_name?: string;
};
type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
};

export function NewPlanDrawer({
  locale,
  patientId,
  onClose,
  onSuccess,
}: {
  locale: string;
  patientId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { format, symbol } = useCurrency();
  const [services, setServices] = useState<Service[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState({
    name_en: "",
    name_fr: "",
    name_ar: "",
    provider_id: "",
    total_estimated_cost: "",
    notes: "",
  });
  const [items, setItems] = useState([
    {
      service_id: "",
      description_en: "",
      quantity_total: 1,
      unit_price: "",
      sequence_order: 1,
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/services"), fetch("/api/providers")]).then(
      async ([s, p]) => {
        const sData = await s.json();
        const pData = await p.json();
        setServices((sData.services ?? sData ?? []) as Service[]);
        const rawProviders = pData?.providers ?? pData;
        setProviders((Array.isArray(rawProviders) ? rawProviders : []) as Provider[]);
      }
    );

    if (patientId) {
      fetch(`/api/patients/${patientId}`)
        .then((r) => r.json())
        .then((d) => {
          const pat = d.patient ?? d;
          if (pat?.id) {
            setSelectedPatient({
              id: pat.id,
              first_name: pat.first_name ?? pat.firstName ?? "",
              last_name: pat.last_name ?? pat.lastName ?? "",
              phone: pat.phone ?? "",
            });
          }
        });
    }
  }, [patientId]);

  useEffect(() => {
    if (patientSearch.length < 2) {
      setPatients([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/patients?search=${encodeURIComponent(patientSearch)}`
      );
      const data = await res.json();
      const list = (data.patients ?? data ?? []) as Record<string, unknown>[];
      setPatients(
        list.map((p) => ({
          id: p.id as string,
          first_name: (p.first_name ?? p.firstName) as string,
          last_name: (p.last_name ?? p.lastName) as string,
          phone: (p.phone ?? "") as string,
        }))
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        service_id: "",
        description_en: "",
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
            description_en: service?.name_en ?? service?.nameEn ?? "",
            unit_price: String(
              service?.default_price ?? service?.defaultPrice ?? ""
            ),
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  const totalValue = items.reduce(
    (s, i) => s + (Number(i.unit_price) * Number(i.quantity_total) || 0),
    0
  );

  async function handleSubmit() {
    if (!selectedPatient) {
      setError("Select a patient");
      return;
    }
    if (!form.name_en.trim()) {
      setError("Plan name is required");
      return;
    }
    if (!form.provider_id) {
      setError("Select a provider");
      return;
    }
    if (items.some((i) => !i.description_en?.trim() || !i.unit_price)) {
      setError("Fill in all treatment items (description and price)");
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
        patient_id: selectedPatient.id,
        provider_id: form.provider_id,
        name_en: form.name_en,
        name_fr: form.name_fr || form.name_en,
        name_ar: form.name_ar || form.name_en,
        notes: form.notes || undefined,
        total_estimated_cost: form.total_estimated_cost ? Number(form.total_estimated_cost) : undefined,
        items: items.map((item) => ({
          service_id: item.service_id || null,
          description_en: item.description_en,
          description_fr: item.description_en,
          description_ar: item.description_en,
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

    onSuccess();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 end-0 z-50 w-full max-w-lg bg-card shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">New Treatment Plan</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            type="button"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Patient <span className="text-red-500">*</span>
            </label>
            {selectedPatient ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted">
                <span className="text-sm font-medium">
                  {selectedPatient.first_name} {selectedPatient.last_name} ·{" "}
                  {selectedPatient.phone}
                </span>
                {!patientId && (
                  <button
                    onClick={() => setSelectedPatient(null)}
                    className="text-muted-foreground text-xs hover:text-foreground p-0.5"
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search patient..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {patients.length > 0 && (
                  <div className="absolute top-full mt-1 w-full rounded-lg border bg-card shadow-lg z-10 max-h-48 overflow-y-auto">
                    {patients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p);
                          setPatients([]);
                          setPatientSearch("");
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      >
                        {p.first_name} {p.last_name} · {p.phone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Plan Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              placeholder="e.g. Full Dental Treatment"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Provider <span className="text-red-500">*</span>
            </label>
            <select
              value={form.provider_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, provider_id: e.target.value }))
              }
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
            <label className="block text-sm font-medium mb-2">
              Treatment Items <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Item {i + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(i)}
                        className="text-red-500 text-xs hover:text-red-700"
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <select
                    value={item.service_id}
                    onChange={(e) =>
                      updateItem(i, "service_id", e.target.value)
                    }
                    className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none"
                  >
                    <option value="">Manual entry...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_en ?? s.nameEn}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description_en}
                    onChange={(e) =>
                      updateItem(i, "description_en", e.target.value)
                    }
                    className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Sessions
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity_total}
                        onChange={(e) =>
                          updateItem(i, "quantity_total", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Price/session
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(i, "unit_price", e.target.value)
                        }
                        className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addItem}
                className="text-sm text-primary hover:underline"
                type="button"
              >
                + Add item
              </button>
            </div>
          </div>

          <div className="flex justify-between text-sm font-semibold border-t pt-3">
            <span>Total Plan Value</span>
            <span>{format(totalValue)}</span>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            type="button"
          >
            {loading ? "Creating..." : "Create Plan"}
          </button>
        </div>
      </div>
    </>
  );
}
