"use client";
import { useState, useEffect } from "react";
import { Calendar, Clock, User, Phone, Mail, ChevronRight, ChevronLeft, CheckCircle, Loader2, Stethoscope, MapPin } from "lucide-react";

type Org = {
  id: string; name: string; slug: string;
  timezone: string; currency: string;
  booking_message: string | null;
  phone: string | null; address: string | null; logo_url: string | null;
};
type Service = { id: string; name: string; price: number; duration: number };
type Provider = { id: string; name: string; specialty: string; color_hex: string };

const STEPS = ["Service", "Provider", "Date & Time", "Your Info", "Confirm"];

function generateSlots(busySlots: { start: string; end: string }[], duration: number) {
  const slots: { time: string; available: boolean }[] = [];
  for (let h = 8; h < 19; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const slotStart = new Date(`2000-01-01T${timeStr}:00`);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);
      const endLimit = new Date(`2000-01-01T19:00:00`);
      if (slotEnd > endLimit) break;

      const isBusy = busySlots.some(b => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        const sStart = new Date(`${new Date().toISOString().split("T")[0]}T${timeStr}:00`);
        const sEnd = new Date(sStart.getTime() + duration * 60000);
        return sStart < bEnd && sEnd > bStart;
      });

      slots.push({ time: timeStr, available: !isBusy });
    }
  }
  return slots;
}

function getDates() {
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() !== 0) dates.push(d); // skip Sundays
  }
  return dates;
}

export function PublicBookingClient({ org }: { org: Org }) {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [confirmedTime, setConfirmedTime] = useState<string>("");

  useEffect(() => {
    fetch(`/api/book/${org.slug}/services`).then(r => r.json()).then(setServices);
    fetch(`/api/book/${org.slug}/providers`).then(r => r.json()).then(setProviders);
  }, [org.slug]);

  useEffect(() => {
    if (!selectedDate || !selectedProvider || !selectedService) return;
    setSlotsLoading(true);
    const dateStr = selectedDate.toISOString().split("T")[0];
    fetch(`/api/book/${org.slug}/availability?date=${dateStr}&provider_id=${selectedProvider.id}`)
      .then(r => r.json())
      .then(data => {
        setSlots(generateSlots(data.busy ?? [], selectedService.duration));
        setSlotsLoading(false);
      });
  }, [selectedDate, selectedProvider, selectedService, org.slug]);

  async function handleSubmit() {
    if (!form.name || !form.phone) { setError("Name and phone are required"); return; }
    setSubmitting(true);
    setError("");
    const dateStr = selectedDate!.toISOString().split("T")[0];
    const res = await fetch(`/api/book/${org.slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_name: form.name,
        patient_phone: form.phone,
        patient_email: form.email || null,
        provider_id: selectedProvider!.id,
        service_id: selectedService!.id,
        date: dateStr,
        time: selectedTime,
        notes: form.notes || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Booking failed"); setSubmitting(false); return; }
    setConfirmedTime(new Date(data.start_time).toLocaleString("en", {
      weekday: "long", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }));
    setSuccess(true);
    setSubmitting(false);
  }

  // SUCCESS SCREEN
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="size-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
          <p className="text-gray-500 mt-2">Your appointment has been scheduled.</p>
          <div className="mt-6 rounded-2xl bg-gray-50 p-5 text-start space-y-3">
            <div className="flex items-center gap-3">
              <Stethoscope className="size-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Service</p>
                <p className="font-medium text-sm">{selectedService?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="size-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Provider</p>
                <p className="font-medium text-sm">{selectedProvider?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="size-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Date & Time</p>
                <p className="font-medium text-sm">{confirmedTime}</p>
              </div>
            </div>
          </div>
          {org.phone && (
            <p className="text-sm text-gray-500 mt-5">
              Questions? Call us at{" "}
              <a href={`tel:${org.phone}`} className="text-blue-600 font-medium">{org.phone}</a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          {org.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
              {org.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="font-bold text-gray-900">{org.name}</h1>
            {org.address && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <MapPin className="size-3" />{org.address}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                i < step ? "bg-blue-600 text-white" :
                i === step ? "bg-blue-600 text-white ring-4 ring-blue-100" :
                "bg-gray-200 text-gray-400"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? "text-blue-600 font-medium" : "text-gray-400"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-blue-600" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {org.booking_message && step === 0 && (
          <div className="rounded-2xl bg-blue-50 border border-blue-100 px-5 py-3 mb-6 text-sm text-blue-700">
            {org.booking_message}
          </div>
        )}

        {/* STEP 0 — Service */}
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Select a Service</h2>
            {services.map(s => (
              <button key={s.id} onClick={() => { setSelectedService(s); setStep(1); }}
                className="w-full rounded-2xl border-2 bg-white hover:border-blue-400 hover:shadow-md transition-all p-4 text-start flex items-center justify-between group">
                <div>
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{s.duration} min · ${Number(s.price).toFixed(2)}</p>
                </div>
                <ChevronRight className="size-5 text-gray-300 group-hover:text-blue-500" />
              </button>
            ))}
          </div>
        )}

        {/* STEP 1 — Provider */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Choose a Provider</h2>
            {providers.map(p => (
              <button key={p.id} onClick={() => { setSelectedProvider(p); setStep(2); }}
                className="w-full rounded-2xl border-2 bg-white hover:border-blue-400 hover:shadow-md transition-all p-4 text-start flex items-center gap-4 group">
                <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                  style={{ backgroundColor: p.color_hex ?? "#3B82F6" }}>
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">Dr. {p.name}</p>
                  {p.specialty && <p className="text-sm text-gray-400">{p.specialty}</p>}
                </div>
                <ChevronRight className="size-5 text-gray-300 group-hover:text-blue-500" />
              </button>
            ))}
            <button onClick={() => setStep(0)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mt-2">
              <ChevronLeft className="size-4" /> Back
            </button>
          </div>
        )}

        {/* STEP 2 — Date & Time */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Pick a Date & Time</h2>
            {/* Date picker */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              {getDates().map(d => {
                const isSelected = selectedDate?.toDateString() === d.toDateString();
                return (
                  <button key={d.toISOString()} onClick={() => { setSelectedDate(d); setSelectedTime(null); }}
                    className={`shrink-0 rounded-2xl border-2 p-3 text-center w-16 transition-all ${isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white hover:border-blue-300"}`}>
                    <p className="text-xs font-medium">{d.toLocaleDateString("en", { weekday: "short" })}</p>
                    <p className="text-xl font-bold mt-0.5">{d.getDate()}</p>
                    <p className="text-xs">{d.toLocaleDateString("en", { month: "short" })}</p>
                  </button>
                );
              })}
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-3">Available times</p>
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-6 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {slots.map(slot => (
                      <button key={slot.time}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`rounded-xl py-2.5 text-sm font-medium border-2 transition-all ${
                          !slot.available ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through" :
                          selectedTime === slot.time ? "bg-blue-600 text-white border-blue-600" :
                          "bg-white text-gray-700 border-gray-200 hover:border-blue-400"
                        }`}>
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
                <ChevronLeft className="size-4" /> Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedDate || !selectedTime}
                className="flex-1 rounded-2xl bg-blue-600 text-white py-3 font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Patient Info */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Information</h2>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="John Smith" className="w-full rounded-2xl border-2 pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Phone Number *</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+961 70 000 000" type="tel" className="w-full rounded-2xl border-2 pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email (optional)</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@email.com" type="email" className="w-full rounded-2xl border-2 pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Notes (optional)</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any specific concerns or questions..."
                rows={3} className="w-full rounded-2xl border-2 px-4 py-3 text-sm focus:outline-none focus:border-blue-400 bg-white resize-none" />
            </div>
            {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(2)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
                <ChevronLeft className="size-4" /> Back
              </button>
              <button onClick={() => setStep(4)}
                disabled={!form.name || !form.phone}
                className="flex-1 rounded-2xl bg-blue-600 text-white py-3 font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                Review Booking <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Confirm */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Your Booking</h2>
            <div className="rounded-3xl bg-white border-2 border-gray-100 p-6 space-y-4">
              {[
                { icon: Stethoscope, label: "Service", value: selectedService?.name },
                { icon: User, label: "Provider", value: `Dr. ${selectedProvider?.name}` },
                { icon: Calendar, label: "Date", value: selectedDate?.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }) },
                { icon: Clock, label: "Time", value: selectedTime },
                { icon: User, label: "Name", value: form.name },
                { icon: Phone, label: "Phone", value: form.phone },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Icon className="size-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-semibold text-gray-900 text-sm">{value}</p>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">Appointment Fee</span>
                <span className="font-bold text-lg">${Number(selectedService?.price ?? 0).toFixed(2)}</span>
              </div>
            </div>
            {error && <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mt-4">{error}</div>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(3)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
                <ChevronLeft className="size-4" /> Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 rounded-2xl bg-blue-600 text-white py-3.5 font-bold disabled:opacity-50 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-base">
                {submitting ? <><Loader2 className="size-5 animate-spin" /> Booking...</> : <><CheckCircle className="size-5" /> Confirm Booking</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}