"use client";

import { useState, useEffect } from "react";
import { Pencil, Loader2, Check } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";

type Provider = {
  id: string;
  name?: string;
  specialtyEn?: string;
  specialty_en?: string;
  specialtyFr?: string;
  specialtyAr?: string;
  bioEn?: string;
  bioFr?: string;
  bioAr?: string;
  colorHex?: string;
  color_hex?: string;
  isAcceptingAppointments?: boolean;
  is_accepting_appointments?: boolean;
};

export function ProvidersSection() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState({
    specialty_en: "",
    bio_en: "",
    color_hex: "#3B82F6",
    is_accepting_appointments: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/providers", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d) ? d : d?.providers ?? d ?? [];
        setProviders(Array.isArray(raw) ? raw : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const openEdit = (p: Provider) => {
    setEditingProvider(p);
    setForm({
      specialty_en: p.specialtyEn ?? p.specialty_en ?? "",
      bio_en: p.bioEn ?? p.bio_en ?? "",
      color_hex: p.colorHex ?? p.color_hex ?? "#3B82F6",
      is_accepting_appointments: p.isAcceptingAppointments ?? p.is_accepting_appointments ?? true,
    });
    setSlideOpen(true);
  };

  const closeSlide = () => {
    setSlideOpen(false);
    setEditingProvider(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    setSubmitting(true);
    const res = await fetch(`/api/providers/${editingProvider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        specialty_en: form.specialty_en.trim() || undefined,
        bio_en: form.bio_en.trim() || undefined,
        color_hex: /^#[0-9A-Fa-f]{6}$/.test(form.color_hex) ? form.color_hex : undefined,
        is_accepting_appointments: form.is_accepting_appointments,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setProviders((s) =>
        s.map((x) =>
          x.id === editingProvider.id
            ? {
                ...x,
                specialtyEn: d.specialtyEn ?? d.specialty_en,
                bioEn: d.bioEn ?? d.bio_en,
                colorHex: d.colorHex ?? d.color_hex,
                isAcceptingAppointments: d.isAcceptingAppointments,
              }
            : x
        )
      );
      closeSlide();
    }
    setSubmitting(false);
  };

  const toggleAccepting = async (id: string, current: boolean) => {
    const res = await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_accepting_appointments: !current }),
    });
    if (res.ok) {
      const d = await res.json();
      setProviders((s) =>
        s.map((x) =>
          x.id === id
            ? { ...x, isAcceptingAppointments: d.isAcceptingAppointments }
            : x
        )
      );
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">Providers</h2>
          <p className="text-xs text-muted-foreground">
            Edit provider profiles, specialties, and booking availability.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">
            Loading...
          </div>
        ) : providers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No providers yet. Create a user with the provider role first.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Specialty</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Availability</th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const name = p.name ?? "—";
                const specialty = p.specialtyEn ?? p.specialty_en ?? "—";
                const accepting = p.isAcceptingAppointments ?? p.is_accepting_appointments ?? true;
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium">{name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{specialty}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggleAccepting(p.id, accepting)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          accepting
                            ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                            : "bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"
                        }`}
                      >
                        {accepting ? "Accepting" : "Not accepting"}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openEdit(p)}
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

      <SlideOver open={slideOpen} onClose={closeSlide} title="Edit Provider">
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingProvider && (
            <p className="text-sm text-muted-foreground">
              Editing: <strong>{editingProvider.name}</strong>
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Specialty
            </label>
            <input
              type="text"
              placeholder="e.g. Dentist"
              value={form.specialty_en}
              onChange={(e) => setForm((f) => ({ ...f, specialty_en: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
            <textarea
              placeholder="Short bio..."
              value={form.bio_en}
              onChange={(e) => setForm((f) => ({ ...f, bio_en: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Color (hex)
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={form.color_hex}
                onChange={(e) => setForm((f) => ({ ...f, color_hex: e.target.value }))}
                className="h-10 w-14 cursor-pointer rounded border"
              />
              <input
                type="text"
                value={form.color_hex}
                onChange={(e) => setForm((f) => ({ ...f, color_hex: e.target.value }))}
                className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="#3B82F6"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_accepting"
              checked={form.is_accepting_appointments}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_accepting_appointments: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            <label htmlFor="is_accepting" className="text-sm">
              Accepting appointments
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
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save
            </button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
