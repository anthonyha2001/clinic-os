"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown } from "lucide-react";

type PaymentMethod = {
  id: string;
  type: string;
  labelEn: string;
  labelFr: string;
  labelAr: string;
  isActive: boolean;
  displayOrder: number;
};

export default function PaymentsSettingsPage() {
  const t = useTranslations("common");
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMethods = useCallback(async () => {
    const res = await fetch("/api/payment-methods", { credentials: "include" });
    if (!res.ok) return;
    const d = await res.json();
    const raw = d?.payment_methods ?? d?.paymentMethods ?? d;
    setMethods(Array.isArray(raw) ? raw : []);
  }, []);

  useEffect(() => {
    fetchMethods().finally(() => setLoading(false));
  }, [fetchMethods]);

  const getLabel = (m: PaymentMethod) => {
    if (locale === "fr") return m.labelFr;
    if (locale === "ar") return m.labelAr;
    return m.labelEn;
  };

  const updateMethod = async (
    id: string,
    patch: Partial<PaymentMethod>
  ) => {
    const res = await fetch(`/api/payment-methods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label_en: patch.labelEn,
        label_fr: patch.labelFr,
        label_ar: patch.labelAr,
        is_active: patch.isActive,
        display_order: patch.displayOrder,
      }),
      credentials: "include",
    });
    if (res.ok) await fetchMethods();
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const arr = [...methods];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    const newOrder = arr.map((m, i) => ({ ...m, displayOrder: i }));
    setMethods(newOrder);
    updateMethod(arr[idx].id, { displayOrder: idx - 1 });
    updateMethod(arr[idx - 1].id, { displayOrder: idx });
  };

  const moveDown = (idx: number) => {
    if (idx >= methods.length - 1) return;
    const arr = [...methods];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    const newOrder = arr.map((m, i) => ({ ...m, displayOrder: i }));
    setMethods(newOrder);
    updateMethod(arr[idx].id, { displayOrder: idx });
    updateMethod(arr[idx + 1].id, { displayOrder: idx + 1 });
  };

  if (loading) return <div className="text-muted-foreground">{t("loading")}</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Toggle active and reorder payment methods. Labels are editable.
      </p>
      <div className="space-y-2">
        {(Array.isArray(methods) ? methods : []).map((m, idx) => (
          <div
            key={m.id}
            className="flex items-center gap-4 rounded-lg border border-border p-4"
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="rounded p-1 hover:bg-muted disabled:opacity-30"
                aria-label="Move up"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === methods.length - 1}
                className="rounded p-1 hover:bg-muted disabled:opacity-30"
                aria-label="Move down"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={m.labelEn}
                onChange={(e) =>
                  setMethods((prev) =>
                    prev.map((x) =>
                      x.id === m.id ? { ...x, labelEn: e.target.value } : x
                    )
                  )
                }
                onBlur={(e) => {
                  if (e.target.value !== m.labelEn) {
                    updateMethod(m.id, { labelEn: e.target.value });
                  }
                }}
                placeholder="Label EN"
                className="rounded border border-border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={m.labelFr}
                onChange={(e) =>
                  setMethods((prev) =>
                    prev.map((x) =>
                      x.id === m.id ? { ...x, labelFr: e.target.value } : x
                    )
                  )
                }
                onBlur={(e) => {
                  if (e.target.value !== m.labelFr) {
                    updateMethod(m.id, { labelFr: e.target.value });
                  }
                }}
                placeholder="Label FR"
                className="rounded border border-border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={m.labelAr}
                onChange={(e) =>
                  setMethods((prev) =>
                    prev.map((x) =>
                      x.id === m.id ? { ...x, labelAr: e.target.value } : x
                    )
                  )
                }
                onBlur={(e) => {
                  if (e.target.value !== m.labelAr) {
                    updateMethod(m.id, { labelAr: e.target.value });
                  }
                }}
                placeholder="Label AR"
                className="rounded border border-border px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                updateMethod(m.id, { isActive: !m.isActive })
              }
              className={`rounded px-3 py-1.5 text-sm ${m.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
            >
              {m.isActive ? "Active" : "Inactive"}
            </button>
          </div>
        ))}
      </div>
      {methods.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          No payment methods. Run bootstrap to create default methods.
        </p>
      )}
    </div>
  );
}
