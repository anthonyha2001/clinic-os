"use client";
import { useState, useEffect } from "react";
import { Plus, Trash2, Check, Loader2, Pencil, X, Calendar } from "lucide-react";
import { useTheme } from "next-themes";
import { useCurrency } from "@/lib/context/CurrencyContext";
import type { WorkingHours, OffDay, DayKey } from "@/types/schedule";
import { DEFAULT_WORKING_HOURS } from "@/types/schedule";

const TABS = ["Services", "Provider Types", "Clinic Info", "Appearance", "Schedule", "WhatsApp"] as const;

const PROVIDER_TYPES = [
  "General Practitioner", "Dentist", "Physiotherapist", "Dermatologist",
  "Pediatrician", "Gynecologist", "Cardiologist", "Orthopedic Surgeon",
  "Neurologist", "Psychiatrist", "Ophthalmologist", "ENT Specialist",
  "Nutritionist", "Nurse", "Radiologist",
];

type OrgSettings = {
  name?: string;
  currency?: string;
  clinic_phone?: string;
  clinic_address?: string;
  clinic_email?: string;
  booking_enabled?: boolean;
  booking_message?: string;
  whatsapp_enabled?: boolean;
  whatsapp_provider?: string;
  whatsapp_number?: string;
  whatsapp_api_token?: string;
  whatsapp_phone_number_id?: string;
  working_hours?: WorkingHours;
  off_days?: OffDay[];
};

const CURRENCY_OPTIONS = [
  { code: "USD", label: "USD - US Dollar ($)" },
  { code: "EUR", label: "EUR - Euro (€)" },
  { code: "GBP", label: "GBP - British Pound (£)" },
  { code: "LBP", label: "LBP - Lebanese Pound (ل.ل)" },
  { code: "AED", label: "AED - UAE Dirham (د.إ)" },
  { code: "SAR", label: "SAR - Saudi Riyal (﷼)" },
  { code: "EGP", label: "EGP - Egyptian Pound (E£)" },
  { code: "JOD", label: "JOD - Jordanian Dinar (JD)" },
  { code: "KWD", label: "KWD - Kuwaiti Dinar (KD)" },
  { code: "QAR", label: "QAR - Qatari Riyal (QR)" },
  { code: "TRY", label: "TRY - Turkish Lira (₺)" },
  { code: "CAD", label: "CAD - Canadian Dollar (CA$)" },
  { code: "AUD", label: "AUD - Australian Dollar (A$)" },
];

type Service = {
  id: string;
  name_en?: string;
  nameEn?: string;
  defaultPrice?: string | number;
  price?: string | number;
  defaultDurationMinutes?: number;
  default_duration_minutes?: number;
  isActive?: boolean;
  is_active?: boolean;
};

type Tab = typeof TABS[number];

export function SettingsClient({ locale, defaultTab }: { locale: string; defaultTab?: Tab }) {
  const singleSection = Boolean(defaultTab);
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab ?? "Services");
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [bookingUrl, setBookingUrl] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name_en: string; price: string; duration: string }>({ name_en: "", price: "", duration: "30" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [newService, setNewService] = useState({ name_en: "", price: "", duration: "30" });
  const [addingService, setAddingService] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; mock?: boolean } | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [workingHours, setWorkingHours] = useState<WorkingHours>(DEFAULT_WORKING_HOURS);
  const [offDays, setOffDays] = useState<OffDay[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [showAddOffDay, setShowAddOffDay] = useState(false);
  const [newOffDay, setNewOffDay] = useState({ date: "", label: "", recurring: false });
  const { format } = useCurrency();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (orgSettings.name !== undefined) setClinicName(orgSettings.name);
  }, [orgSettings.name]);

  useEffect(() => {
    if (orgSettings.currency !== undefined) setCurrency(orgSettings.currency || "USD");
  }, [orgSettings.currency]);

  useEffect(() => {
    if (orgSettings.working_hours) {
      setWorkingHours({ ...DEFAULT_WORKING_HOURS, ...orgSettings.working_hours } as WorkingHours);
    }
  }, [orgSettings.working_hours]);

  useEffect(() => {
    if (Array.isArray(orgSettings.off_days)) {
      setOffDays(orgSettings.off_days);
    }
  }, [orgSettings.off_days]);

  useEffect(() => {
    const opts = { credentials: "include" as RequestCredentials };
    Promise.all([
      fetch("/api/settings", opts).then((r) => r.json()).then((d) => setOrgSettings(d ?? {})).catch(() => {}),
      fetch("/api/auth/me", opts).then((r) => r.json()).then((d) => setOrgSlug(d?.organizationSlug ?? d?.organization_slug ?? null)).catch(() => setOrgSlug(null)),
      fetch("/api/services", opts)
        .then((r) => r.json())
        .then((d) => {
          const raw = Array.isArray(d) ? d : d?.services ?? d;
          setServices(Array.isArray(raw) ? raw : []);
        })
        .catch(() => {})
        .finally(() => setLoadingServices(false)),
    ]);
  }, []);

  useEffect(() => {
    if (orgSlug && typeof window !== "undefined") {
      setBookingUrl(`${window.location.origin}/book/${orgSlug}`);
    } else {
      setBookingUrl("");
    }
  }, [orgSlug]);

  async function addService() {
    if (!newService.name_en.trim()) return;
    setAddingService(true);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name_en: newService.name_en,
        name_fr: newService.name_en,
        name_ar: newService.name_en,
        default_price: parseFloat(newService.price) || 0,
        default_duration_minutes: parseInt(newService.duration) || 30,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setServices(s => [...s, d]);
      setNewService({ name_en: "", price: "", duration: "30" });
      setShowAddForm(false);
    }
    setAddingService(false);
  }

  async function saveSettings(updates: Partial<OrgSettings>) {
    setSavingSettings(true);
    setSettingsSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const d = await res.json();
      setOrgSettings((prev) => ({ ...prev, ...d }));
      const nextCurrency = (d?.currency ?? updates.currency) as string | undefined;
      if (nextCurrency && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("currency-updated", { detail: { currency: nextCurrency } })
        );
      }
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    }
    setSavingSettings(false);
  }

  async function saveWorkingHours() {
    setSavingSchedule(true);
    setScheduleSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ working_hours: workingHours }),
    });
    if (res.ok) {
      const d = await res.json();
      setOrgSettings((prev) => ({ ...prev, ...d }));
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
    }
    setSavingSchedule(false);
  }

  async function saveOffDays(nextOffDays?: OffDay[]) {
    const payloadOffDays = nextOffDays ?? offDays;
    setSavingSchedule(true);
    setScheduleSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ off_days: payloadOffDays }),
    });
    if (res.ok) {
      const d = await res.json();
      setOrgSettings((prev) => ({ ...prev, ...d }));
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
    }
    setSavingSchedule(false);
  }

  function addOffDay() {
    if (!newOffDay.date || !newOffDay.label.trim()) return;
    const id = crypto.randomUUID();
    const item: OffDay = { id, date: newOffDay.date, label: newOffDay.label.trim(), recurring: newOffDay.recurring };
    const updated = [...offDays, item].sort((a, b) => a.date.localeCompare(b.date));
    setOffDays(updated);
    setNewOffDay({ date: "", label: "", recurring: false });
    setShowAddOffDay(false);
    saveOffDays(updated);
  }

  function removeOffDay(id: string) {
    const updated = offDays.filter((o) => o.id !== id);
    setOffDays(updated);
    saveOffDays(updated);
  }

  const DAY_LABELS: Record<DayKey, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };

  async function testWhatsApp() {
    if (!testPhone) return;
    setTestLoading(true);
    setTestResult(null);
    const res = await fetch("/api/settings/whatsapp-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone: testPhone }),
    });
    const data = await res.json();
    setTestResult(data);
    setTestLoading(false);
  }

  async function toggleService(id: string, currentActive: boolean) {
    await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_active: !currentActive }),
    });
    setServices(s => s.map(sv => sv.id === id ? { ...sv, isActive: !currentActive, is_active: !currentActive } : sv));
  }

  function startEditService(sv: Service) {
    const name = sv.name_en ?? sv.nameEn ?? "";
    const price = String(sv.defaultPrice ?? sv.price ?? 0);
    const duration = String(sv.defaultDurationMinutes ?? sv.default_duration_minutes ?? 30);
    setEditingServiceId(sv.id);
    setEditForm({ name_en: name, price, duration });
  }

  function cancelEdit() {
    setEditingServiceId(null);
    setEditForm({ name_en: "", price: "", duration: "30" });
  }

  async function saveEdit() {
    if (!editingServiceId || !editForm.name_en.trim()) return;
    setSavingEdit(true);
    const res = await fetch(`/api/services/${editingServiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name_en: editForm.name_en.trim(),
        name_fr: editForm.name_en.trim(),
        name_ar: editForm.name_en.trim(),
        default_price: parseFloat(editForm.price) || 0,
        default_duration_minutes: parseInt(editForm.duration, 10) || 30,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setServices(s => s.map(sv => sv.id === editingServiceId ? {
        ...sv,
        name_en: d.nameEn,
        nameEn: d.nameEn,
        defaultPrice: d.defaultPrice,
        price: d.defaultPrice,
        defaultDurationMinutes: d.defaultDurationMinutes,
        default_duration_minutes: d.defaultDurationMinutes,
      } : sv));
      cancelEdit();
    }
    setSavingEdit(false);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {!singleSection && (
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your clinic configuration</p>
        </div>
      )}

      {/* Tabs - hidden when on a dedicated route (layout nav is the only tab row) */}
      {!singleSection && (
        <div className="border-b flex gap-0.5">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* SERVICES TAB */}
      {activeTab === "Services" && (
        <div className="space-y-5">
          {/* Services list */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Your Services</h2>
                <p className="text-xs text-muted-foreground">{services.length} services configured</p>
              </div>
              <button
                onClick={() => setShowAddForm(s => !s)}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 flex items-center gap-1.5"
              >
                <Plus className="size-3.5" /> Add Service
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="px-5 py-4 border-b bg-muted/30">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Service Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Root Canal"
                      value={newService.name_en}
                      onChange={e => setNewService(s => ({ ...s, name_en: e.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Price</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={newService.price}
                      onChange={e => setNewService(s => ({ ...s, price: e.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (min)</label>
                    <input
                      type="number"
                      value={newService.duration}
                      onChange={e => setNewService(s => ({ ...s, duration: e.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setShowAddForm(false)} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted">Cancel</button>
                  <button
                    onClick={addService}
                    disabled={addingService || !newService.name_en.trim()}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {addingService ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {loadingServices ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Loading...</div>
            ) : services.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No services yet. Add one manually.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-5 py-3 text-start font-medium text-muted-foreground">Service</th>
                    <th className="px-5 py-3 text-end font-medium text-muted-foreground">Price</th>
                    <th className="px-5 py-3 text-end font-medium text-muted-foreground">Duration</th>
                    <th className="px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-center font-medium text-muted-foreground w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map(sv => {
                    const name = sv.name_en ?? sv.nameEn ?? "—";
                    const price = sv.defaultPrice ?? sv.price ?? 0;
                    const duration = sv.defaultDurationMinutes ?? sv.default_duration_minutes ?? 30;
                    const active = sv.isActive ?? sv.is_active ?? true;
                    const isEditing = editingServiceId === sv.id;
                    return (
                      <tr key={sv.id} className={`border-b hover:bg-muted/30 transition-colors ${!active ? "opacity-50" : ""} ${isEditing ? "bg-primary/5" : ""}`}>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.name_en}
                              onChange={e => setEditForm(f => ({ ...f, name_en: e.target.value }))}
                              className="w-full rounded border px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="Service name"
                            />
                          ) : (
                            <span className="font-medium">{name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-end">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.price}
                              onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                              className="w-20 rounded border px-2 py-1.5 text-sm bg-background text-end focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="0"
                            />
                          ) : (
                            format(price)
                          )}
                        </td>
                        <td className="px-5 py-3 text-end">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editForm.duration}
                              onChange={e => setEditForm(f => ({ ...f, duration: e.target.value }))}
                              className="w-16 rounded border px-2 py-1.5 text-sm bg-background text-end focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="30"
                            />
                          ) : (
                            <span className="text-muted-foreground">{duration}min</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {isEditing ? null : (
                            <button
                              onClick={() => toggleService(sv.id, active)}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400"}`}
                            >
                              {active ? "Active" : "Inactive"}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={saveEdit}
                                disabled={savingEdit || !editForm.name_en.trim()}
                                className="rounded p-1.5 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50"
                                title="Save"
                              >
                                {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                                title="Cancel"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditService(sv)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                              title="Edit"
                            >
                              <Pencil className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* PROVIDER TYPES TAB */}
      {activeTab === "Provider Types" && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Healthcare Provider Types</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Standard specialties available when creating providers.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {PROVIDER_TYPES.map(type => (
              <div key={type} className="flex items-center gap-2 rounded-lg border px-3 py-2.5 bg-muted/30">
                <Check className="size-3.5 text-green-500 shrink-0" />
                <span className="text-sm">{type}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Provider types are used to categorize providers. Contact support to add custom types.
          </p>
        </div>
      )}

      {/* CLINIC INFO TAB */}
      {activeTab === "Clinic Info" && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <h2 className="text-sm font-semibold mb-4">Clinic Information</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">Clinic Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={clinicName}
                onChange={e => setClinicName(e.target.value)}
                placeholder="Your clinic name"
                className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => saveSettings({ name: clinicName.trim() })}
                disabled={savingSettings || !clinicName.trim() || clinicName.trim() === (orgSettings.name ?? "").trim()}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingSettings ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Currency</label>
            <div className="flex gap-2">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {CURRENCY_OPTIONS.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => saveSettings({ currency })}
                disabled={savingSettings || currency === (orgSettings.currency ?? "USD")}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingSettings ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {orgSlug && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold mb-1">Your Public Booking Link</p>
              <p className="text-xs text-muted-foreground mb-3">Share this link with patients so they can book online</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={bookingUrl}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => bookingUrl && navigator.clipboard.writeText(bookingUrl)}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-muted"
                >
                  Copy
                </button>
                <a
                  href={`/book/${orgSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs hover:opacity-90"
                >
                  Preview
                </a>
              </div>
            </div>
          )}
          {!orgSlug && (
            <p className="text-sm text-muted-foreground">Loading booking link...</p>
          )}
        </div>
      )}

      {/* APPEARANCE TAB */}
      {activeTab === "Appearance" && (
        <div className="rounded-xl border bg-card p-5 space-y-6">
          <h2 className="text-sm font-semibold mb-4">Appearance</h2>

          <div className="space-y-3">
            <label className="text-sm font-medium block">Theme Preference</label>
            <div className="flex gap-2 flex-wrap">
              {(["light", "system", "dark"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium border-2 transition-all capitalize ${
                    theme === t
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Currency</label>
            <div className="flex gap-2">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="flex-1 max-w-xs rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {CURRENCY_OPTIONS.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => saveSettings({ currency })}
                disabled={savingSettings || currency === (orgSettings.currency ?? "USD")}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingSettings ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <p className="text-sm text-muted-foreground">
              Current locale: <span className="font-medium text-foreground">{locale}</span>. Change the URL to switch language (e.g. /en/... for English, /fr/... for French, /ar/... for Arabic).
            </p>
          </div>
        </div>
      )}

      {/* SCHEDULE TAB */}
      {activeTab === "Schedule" && (
        <div className="space-y-5">
          {/* Working Hours */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Working Hours</h2>
            <p className="text-xs text-muted-foreground mb-4">Set opening hours for each day. Affects appointment booking availability.</p>
            <div className="space-y-3">
              {(Object.keys(DAY_LABELS) as DayKey[]).map((day) => {
                const s = workingHours[day] ?? DEFAULT_WORKING_HOURS[day];
                const isOpen = s?.open ?? true;
                return (
                  <div
                    key={day}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
                      isOpen ? "bg-background" : "opacity-50 bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <button
                        type="button"
                        onClick={() =>
                          setWorkingHours((wh) => ({
                            ...wh,
                            [day]: {
                              ...(wh[day] ?? DEFAULT_WORKING_HOURS[day]),
                              open: !isOpen,
                            },
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          isOpen ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            isOpen ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                    </div>
                    {isOpen ? (
                      <>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={s?.from ?? "08:00"}
                            onChange={(e) =>
                              setWorkingHours((wh) => ({
                                ...wh,
                                [day]: { ...(wh[day] ?? DEFAULT_WORKING_HOURS[day]), from: e.target.value },
                              }))
                            }
                            className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <span className="text-muted-foreground">to</span>
                          <input
                            type="time"
                            value={s?.to ?? "18:00"}
                            onChange={(e) =>
                              setWorkingHours((wh) => ({
                                ...wh,
                                [day]: { ...(wh[day] ?? DEFAULT_WORKING_HOURS[day]), to: e.target.value },
                              }))
                            }
                            className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!!(s?.break_from && s?.break_to)}
                              onChange={(e) => {
                                const hasBreak = e.target.checked;
                                setWorkingHours((wh) => ({
                                  ...wh,
                                  [day]: {
                                    ...(wh[day] ?? DEFAULT_WORKING_HOURS[day]),
                                    break_from: hasBreak ? "13:00" : null,
                                    break_to: hasBreak ? "14:00" : null,
                                  },
                                }));
                              }}
                              className="rounded border"
                            />
                            Break
                          </label>
                          {s?.break_from && s?.break_to && (
                            <>
                              <input
                                type="time"
                                value={s.break_from}
                                onChange={(ev) =>
                                  setWorkingHours((wh) => ({
                                    ...wh,
                                    [day]: { ...(wh[day] ?? DEFAULT_WORKING_HOURS[day]), break_from: ev.target.value },
                                  }))
                                }
                                className="rounded-lg border px-2 py-1.5 text-xs bg-background"
                              />
                              <span className="text-muted-foreground text-xs">-</span>
                              <input
                                type="time"
                                value={s.break_to}
                                onChange={(ev) =>
                                  setWorkingHours((wh) => ({
                                    ...wh,
                                    [day]: { ...(wh[day] ?? DEFAULT_WORKING_HOURS[day]), break_to: ev.target.value },
                                  }))
                                }
                                className="rounded-lg border px-2 py-1.5 text-xs bg-background"
                              />
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Closed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={saveWorkingHours}
                disabled={savingSchedule}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {savingSchedule ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save Working Hours
              </button>
              {scheduleSaved && (
                <span className="text-sm text-green-600 dark:text-green-400">Saved successfully</span>
              )}
            </div>
          </div>

          {/* Off Days */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Off Days / Holidays</h2>
            <p className="text-xs text-muted-foreground mb-4">Add dates when the clinic is closed. Recurring off days repeat every year.</p>
            {offDays.length === 0 && !showAddOffDay ? (
              <p className="text-sm text-muted-foreground py-4">No off days configured. Add holidays and clinic closures.</p>
            ) : (
              <div className="space-y-3 mb-4">
                {(() => {
                  const today = new Date().toISOString().split("T")[0];
                  const grouped = offDays.reduce<Record<string, OffDay[]>>((acc, o) => {
                    const month = o.date.slice(0, 7);
                    if (!acc[month]) acc[month] = [];
                    acc[month].push(o);
                    return acc;
                  }, {});
                  const months = Object.keys(grouped).sort();
                  return months.map((month) => {
                    const year = month.slice(0, 4);
                    const m = parseInt(month.slice(5), 10);
                    const monthLabel = new Date(parseInt(year, 10), m - 1, 1).toLocaleDateString("en", {
                      month: "long",
                      year: "numeric",
                    });
                    return (
                      <div key={month}>
                        <p className="text-xs font-medium text-muted-foreground mb-2">{monthLabel}</p>
                        <div className="flex flex-wrap gap-2">
                          {grouped[month]!.map((o) => {
                            const d = new Date(o.date + "T12:00:00");
                            const dateLabel = d.toLocaleDateString("en", {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            });
                            const isToday = o.date === today;
                            const isUpcoming = o.date >= today;
                            return (
                              <div
                                key={o.id}
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                  isToday || isUpcoming
                                    ? "border-primary/30 bg-primary/5"
                                    : "border-border bg-muted/20"
                                }`}
                              >
                                <Calendar className="size-4 text-muted-foreground shrink-0" />
                                <div>
                                  <p className="font-medium">{dateLabel}</p>
                                  <p className="text-xs text-muted-foreground">{o.label}{o.recurring ? " (recurring)" : ""}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeOffDay(o.id)}
                                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  aria-label="Remove"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
            {showAddOffDay ? (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                  <input
                    type="date"
                    value={newOffDay.date}
                    onChange={(e) => setNewOffDay((n) => ({ ...n, date: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Christmas, Staff Training"
                    value={newOffDay.label}
                    onChange={(e) => setNewOffDay((n) => ({ ...n, label: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newOffDay.recurring}
                    onChange={(e) => setNewOffDay((n) => ({ ...n, recurring: e.target.checked }))}
                    className="rounded border"
                  />
                  Repeat every year
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddOffDay(false);
                      setNewOffDay({ date: "", label: "", recurring: false });
                    }}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addOffDay}
                    disabled={!newOffDay.date || !newOffDay.label.trim()}
                    className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddOffDay(true)}
                className="rounded-lg border border-dashed px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2"
              >
                <Plus className="size-4" /> Add Off Day
              </button>
            )}
          </div>
        </div>
      )}

      {/* WHATSAPP TAB */}
      {activeTab === "WhatsApp" && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">WhatsApp Messaging</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send appointment reminders and no-show followups via WhatsApp
                </p>
              </div>
              <button
                onClick={() => saveSettings({ whatsapp_enabled: !orgSettings.whatsapp_enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  orgSettings.whatsapp_enabled ? "bg-green-500" : "bg-muted"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  orgSettings.whatsapp_enabled ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">WhatsApp Provider</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "meta", label: "Meta Business API", desc: "Official WhatsApp Business", icon: "🟢" },
                { id: "twilio", label: "Twilio", desc: "WhatsApp via Twilio", icon: "🔴" },
                { id: "mock", label: "Mock (Testing)", desc: "Logs to console only", icon: "🧪" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOrgSettings((s) => ({ ...s, whatsapp_provider: p.id }))}
                  className={`rounded-xl border-2 p-4 text-start transition-all ${
                    orgSettings.whatsapp_provider === p.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <p className="text-xl mb-1">{p.icon}</p>
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>

            {orgSettings.whatsapp_provider === "meta" && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Get these from{" "}
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Meta Developer Console
                  </a>
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp Phone Number *</label>
                  <input
                    type="text"
                    placeholder="+961 70 000 000"
                    value={orgSettings.whatsapp_number ?? ""}
                    onChange={(e) => setOrgSettings((s) => ({ ...s, whatsapp_number: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number ID *</label>
                  <input
                    type="text"
                    placeholder="1234567890123456"
                    value={orgSettings.whatsapp_phone_number_id ?? ""}
                    onChange={(e) => setOrgSettings((s) => ({ ...s, whatsapp_phone_number_id: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Access Token *</label>
                  <input
                    type="password"
                    placeholder="EAAxxxxx..."
                    value={orgSettings.whatsapp_api_token ?? ""}
                    onChange={(e) => setOrgSettings((s) => ({ ...s, whatsapp_api_token: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {orgSettings.whatsapp_provider === "twilio" && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Get these from{" "}
                  <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Twilio Console
                  </a>
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp From Number *</label>
                  <input
                    type="text"
                    placeholder="+14155238886"
                    value={orgSettings.whatsapp_number ?? ""}
                    onChange={(e) => setOrgSettings((s) => ({ ...s, whatsapp_number: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Account SID:Auth Token * (format: SID:TOKEN)</label>
                  <input
                    type="password"
                    placeholder="ACxxxxxxxxx:your_auth_token"
                    value={orgSettings.whatsapp_api_token ?? ""}
                    onChange={(e) => setOrgSettings((s) => ({ ...s, whatsapp_api_token: e.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {orgSettings.whatsapp_provider === "mock" && (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900/50 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300 mt-2">
                🧪 Mock mode — messages will be logged to the server console only. No real WhatsApp messages sent.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() =>
                  saveSettings({
                    whatsapp_provider: orgSettings.whatsapp_provider,
                    whatsapp_number: orgSettings.whatsapp_number,
                    whatsapp_api_token: orgSettings.whatsapp_api_token,
                    whatsapp_phone_number_id: orgSettings.whatsapp_phone_number_id,
                  })
                }
                disabled={savingSettings}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {savingSettings ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save Configuration
              </button>
              {settingsSaved && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="size-4" /> Saved!
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">Test WhatsApp Message</h2>
            <p className="text-xs text-muted-foreground">
              Send a test message to verify your configuration is working.
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="+961 70 000 000"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={testWhatsApp}
                disabled={testLoading || !testPhone || !orgSettings.whatsapp_enabled}
                className="rounded-lg bg-green-600 text-white px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {testLoading ? <Loader2 className="size-4 animate-spin" /> : "📱 Send Test"}
              </button>
            </div>
            {!orgSettings.whatsapp_enabled && (
              <p className="text-xs text-orange-500">⚠️ Enable WhatsApp above before testing</p>
            )}
            {testResult && (
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  testResult.success
                    ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-800 dark:text-green-300"
                    : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300"
                }`}
              >
                {testResult.success
                  ? testResult.mock
                    ? "✅ Mock message logged to server console (no real message sent)"
                    : "✅ WhatsApp message sent successfully!"
                  : `❌ Failed: ${testResult.error}`}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">Message Previews</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">📅 Appointment Reminder (sent 1 day before)</p>
                <div className="rounded-xl bg-[#DCF8C6] p-3 text-sm font-mono text-gray-800 whitespace-pre-line max-w-sm">
                  {`Hello [Patient Name]! 👋

This is a reminder from *[Clinic Name]*.

📅 You have an appointment *tomorrow*:
- Date: Monday, March 3
- Time: 10:00 AM
- Service: Teeth Cleaning
- Doctor: Dr. Smith

Please arrive 5 minutes early. 
Reschedule: [booking link]

See you tomorrow! 😊`}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">👻 No-Show Followup (sent 1 hour after missed appointment)</p>
                <div className="rounded-xl bg-[#DCF8C6] p-3 text-sm font-mono text-gray-800 whitespace-pre-line max-w-sm">
                  {`Hello [Patient Name],

We noticed you missed your appointment 
today at *10:00 AM* with Dr. Smith.

We hope everything is okay! 🙏

Would you like to reschedule?
👉 [booking link]

See you soon!`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}