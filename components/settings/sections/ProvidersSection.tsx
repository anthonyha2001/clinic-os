"use client";

import { useState, useEffect } from "react";
import { Pencil, Loader2, Check, Plus, Trash2, AlertTriangle } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";

type Provider = {
  id: string;
  name?: string;
  email?: string;
  specialtyEn?: string;
  specialty_en?: string;
  bioEn?: string;
  bio_en?: string;
  colorHex?: string;
  color_hex?: string;
  isAcceptingAppointments?: boolean;
  is_accepting_appointments?: boolean;
};

const EMPTY_CREATE = {
  full_name: "",
  email: "",
  specialty_en: "",
  bio_en: "",
  color_hex: "#3B82F6",
  is_accepting_appointments: true,
};

const EMPTY_EDIT = {
  specialty_en: "",
  bio_en: "",
  color_hex: "#3B82F6",
  is_accepting_appointments: true,
};

export function ProvidersSection() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  // Slide-over mode: "create" | "edit" | null
  const [slideMode, setSlideMode] = useState<"create" | "edit" | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [editForm, setEditForm]     = useState(EMPTY_EDIT);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget]   = useState<Provider | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d) ? d : d?.providers ?? [];
        setProviders(Array.isArray(raw) ? raw : []);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Open slideovers ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setCreateForm(EMPTY_CREATE);
    setFormError(null);
    setSlideMode("create");
  };

  const openEdit = (p: Provider) => {
    setEditingProvider(p);
    setEditForm({
      specialty_en: p.specialtyEn ?? p.specialty_en ?? "",
      bio_en: p.bioEn ?? p.bio_en ?? "",
      color_hex: p.colorHex ?? p.color_hex ?? "#3B82F6",
      is_accepting_appointments: p.isAcceptingAppointments ?? p.is_accepting_appointments ?? true,
    });
    setFormError(null);
    setSlideMode("edit");
  };

  const closeSlide = () => {
    setSlideMode(null);
    setEditingProvider(null);
    setFormError(null);
  };

  // ── Create ───────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!createForm.full_name.trim()) { setFormError("Full name is required"); return; }
    if (!createForm.email.trim())     { setFormError("Email is required"); return; }
    setSubmitting(true);

    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        full_name:                createForm.full_name.trim(),
        email:                    createForm.email.trim().toLowerCase(),
        specialty_en:             createForm.specialty_en.trim() || undefined,
        bio_en:                   createForm.bio_en.trim() || undefined,
        color_hex:                /^#[0-9A-Fa-f]{6}$/.test(createForm.color_hex) ? createForm.color_hex : "#3B82F6",
        is_accepting_appointments: createForm.is_accepting_appointments,
      }),
    });

    const d = await res.json();
    if (!res.ok) {
      setFormError(d.error ?? "Failed to create provider");
      setSubmitting(false);
      return;
    }

    setProviders((s) => [...s, d]);
    closeSlide();
    setSubmitting(false);
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProvider) return;
    setFormError(null);
    setSubmitting(true);

    const res = await fetch(`/api/providers/${editingProvider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        specialty_en:             editForm.specialty_en.trim() || undefined,
        bio_en:                   editForm.bio_en.trim() || undefined,
        color_hex:                /^#[0-9A-Fa-f]{6}$/.test(editForm.color_hex) ? editForm.color_hex : undefined,
        is_accepting_appointments: editForm.is_accepting_appointments,
      }),
    });

    const d = await res.json();
    if (!res.ok) {
      setFormError(d.error ?? "Failed to update provider");
      setSubmitting(false);
      return;
    }

    setProviders((s) =>
      s.map((x) =>
        x.id === editingProvider.id
          ? { ...x, specialtyEn: d.specialtyEn, bioEn: d.bioEn, colorHex: d.colorHex, color_hex: d.color_hex, isAcceptingAppointments: d.isAcceptingAppointments }
          : x
      )
    );
    closeSlide();
    setSubmitting(false);
  };

  // ── Availability toggle ───────────────────────────────────────────────────────
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
        s.map((x) => x.id === id ? { ...x, isAcceptingAppointments: d.isAcceptingAppointments } : x)
      );
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);

    const res = await fetch(`/api/providers/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      const d = await res.json();
      setDeleteError(d.error ?? "Failed to delete provider");
      setDeleteLoading(false);
      return;
    }

    setProviders((s) => s.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleteLoading(false);
  };

  // ── Shared form fields ────────────────────────────────────────────────────────
  const colorField = (value: string, onChange: (v: string) => void) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">Calendar Color</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="#3B82F6"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Providers</h2>
            <p className="text-xs text-muted-foreground">
              Manage provider accounts, specialties, and booking availability.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Add Provider
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Loading...</div>
        ) : providers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No providers yet.{" "}
            <button onClick={openCreate} className="text-primary underline underline-offset-2">
              Add one now.
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Specialty</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Availability</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const name      = p.name ?? "—";
                const specialty = p.specialtyEn ?? p.specialty_en ?? "—";
                const accepting = p.isAcceptingAppointments ?? p.is_accepting_appointments ?? true;
                const color     = p.colorHex ?? p.color_hex ?? "#3B82F6";
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium">{name}</span>
                      </div>
                    </td>
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
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => { setDeleteError(null); setDeleteTarget(p); }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Slide-over ─────────────────────────────────────────────────── */}
      <SlideOver open={slideMode === "create"} onClose={closeSlide} title="Add Provider">
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
            <input
              type="text"
              placeholder="Dr. Jane Smith"
              value={createForm.full_name}
              onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
            <input
              type="email"
              placeholder="jane@clinic.com"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Specialty</label>
            <input
              type="text"
              placeholder="e.g. Orthodontist"
              value={createForm.specialty_en}
              onChange={(e) => setCreateForm((f) => ({ ...f, specialty_en: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
            <textarea
              placeholder="Short bio..."
              value={createForm.bio_en}
              onChange={(e) => setCreateForm((f) => ({ ...f, bio_en: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
              rows={3}
            />
          </div>
          {colorField(createForm.color_hex, (v) => setCreateForm((f) => ({ ...f, color_hex: v })))}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="create_accepting"
              checked={createForm.is_accepting_appointments}
              onChange={(e) => setCreateForm((f) => ({ ...f, is_accepting_appointments: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="create_accepting" className="text-sm">Accepting appointments</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={closeSlide} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create Provider
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Edit Slide-over ───────────────────────────────────────────────────── */}
      <SlideOver open={slideMode === "edit"} onClose={closeSlide} title="Edit Provider">
        <form onSubmit={handleEdit} className="space-y-4">
          {editingProvider && (
            <p className="text-sm text-muted-foreground">
              Editing: <strong>{editingProvider.name}</strong>
            </p>
          )}
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Specialty</label>
            <input
              type="text"
              placeholder="e.g. Dentist"
              value={editForm.specialty_en}
              onChange={(e) => setEditForm((f) => ({ ...f, specialty_en: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
            <textarea
              placeholder="Short bio..."
              value={editForm.bio_en}
              onChange={(e) => setEditForm((f) => ({ ...f, bio_en: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px]"
              rows={3}
            />
          </div>
          {colorField(editForm.color_hex, (v) => setEditForm((f) => ({ ...f, color_hex: v })))}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit_accepting"
              checked={editForm.is_accepting_appointments}
              onChange={(e) => setEditForm((f) => ({ ...f, is_accepting_appointments: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="edit_accepting" className="text-sm">Accepting appointments</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={closeSlide} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted">
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

      {/* ── Delete Confirmation Dialog ────────────────────────────────────────── */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => !deleteLoading && setDeleteTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 pointer-events-auto space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 shrink-0">
                  <AlertTriangle className="size-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Delete Provider</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Are you sure you want to delete <strong>{deleteTarget.name}</strong>? Their account will be
                    deactivated. This cannot be undone.
                  </p>
                </div>
              </div>
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {deleteError}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteLoading}
                  className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleteLoading}
                  className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleteLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}