"use client";

import { useState, useEffect } from "react";
import { Pencil, Loader2, Check } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";

type PaymentMethod = {
  id: string;
  type?: string;
  labelEn?: string;
  label_en?: string;
  labelFr?: string;
  label_fr?: string;
  labelAr?: string;
  label_ar?: string;
  isActive?: boolean;
  is_active?: boolean;
  displayOrder?: number;
  display_order?: number;
};

export function PaymentsSection() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState({
    label_en: "",
    label_fr: "",
    label_ar: "",
    is_active: true,
    display_order: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/payment-methods", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const raw =
          Array.isArray(d)
            ? d
            : d?.paymentMethods ?? d?.payment_methods ?? d ?? [];
        setMethods(Array.isArray(raw) ? raw : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (m: PaymentMethod) => {
    setEditingMethod(m);
    setForm({
      label_en: m.labelEn ?? m.label_en ?? "",
      label_fr: m.labelFr ?? m.label_fr ?? "",
      label_ar: m.labelAr ?? m.label_ar ?? "",
      is_active: m.isActive ?? m.is_active ?? true,
      display_order: m.displayOrder ?? m.display_order ?? 0,
    });
    setSlideOpen(true);
  };

  const closeSlide = () => {
    setSlideOpen(false);
    setEditingMethod(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMethod) return;
    setSubmitting(true);
    const res = await fetch(`/api/payment-methods/${editingMethod.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        label_en: form.label_en.trim() || undefined,
        label_fr: form.label_fr.trim() || undefined,
        label_ar: form.label_ar.trim() || undefined,
        is_active: form.is_active,
        display_order: form.display_order,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setMethods((s) =>
        s.map((x) =>
          x.id === editingMethod.id
            ? {
                ...x,
                labelEn: d.labelEn ?? d.label_en,
                label_en: d.labelEn ?? d.label_en,
                labelFr: d.labelFr ?? d.label_fr,
                label_fr: d.labelFr ?? d.label_fr,
                labelAr: d.labelAr ?? d.label_ar,
                label_ar: d.labelAr ?? d.label_ar,
                isActive: d.isActive ?? d.is_active,
                is_active: d.isActive ?? d.is_active,
                displayOrder: d.displayOrder ?? d.display_order,
                display_order: d.displayOrder ?? d.display_order,
              }
            : x
        )
      );
      closeSlide();
    }
    setSubmitting(false);
  };

  const formatType = (t: string | undefined) => {
    if (!t) return "\u2014";
    return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">Payment Methods</h2>
          <p className="text-xs text-muted-foreground">
            Manage payment methods available for billing. Labels can be
            customized per language.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">
            Loading...
          </div>
        ) : methods.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No payment methods configured.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">
                  Type
                </th>
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">
                  Label
                </th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-5 py-3 text-end font-medium text-muted-foreground">
                  Order
                </th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => {
                const label = m.labelEn ?? m.label_en ?? formatType(m.type);
                const active = m.isActive ?? m.is_active ?? true;
                return (
                  <tr
                    key={m.id}
                    className={`border-b hover:bg-muted/30 transition-colors ${
                      !active ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-5 py-3 font-medium">
                      {formatType(m.type)}
                    </td>
                    <td className="px-5 py-3">{label}</td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-end text-muted-foreground">
                      {m.displayOrder ?? m.display_order ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openEdit(m)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver
        open={slideOpen}
        onClose={closeSlide}
        title="Edit Payment Method"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Label (English) *
            </label>
            <input
              type="text"
              placeholder="e.g. Cash"
              value={form.label_en}
              onChange={(e) =>
                setForm((f) => ({ ...f, label_en: e.target.value }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Label (French)
            </label>
            <input
              type="text"
              placeholder="e.g. Esp\u00e8ces"
              value={form.label_fr}
              onChange={(e) =>
                setForm((f) => ({ ...f, label_fr: e.target.value }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Label (Arabic)
            </label>
            <input
              type="text"
              placeholder="e.g. \u0646\u0642\u062f\u0627\u064b"
              value={form.label_ar}
              onChange={(e) =>
                setForm((f) => ({ ...f, label_ar: e.target.value }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Display Order
            </label>
            <input
              type="number"
              min="0"
              value={form.display_order}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  display_order: parseInt(e.target.value, 10) || 0,
                }))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_active: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            <label htmlFor="is_active" className="text-sm">
              Active
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeSlide}
              className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save
            </button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}