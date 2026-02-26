"use client";
import { useState, useEffect } from "react";
import { Save, Loader2, AlertTriangle } from "lucide-react";

const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-","Unknown"];
const COMMON_ALLERGIES = ["Penicillin","Amoxicillin","Aspirin","Ibuprofen","Latex","Iodine","Sulfa drugs","Codeine"];
const COMMON_CONDITIONS = ["Diabetes","Hypertension","Heart Disease","Asthma","Epilepsy","HIV/AIDS","Hepatitis","Osteoporosis","Thyroid disorder","Kidney disease"];

interface MedicalHistory {
  blood_type?: string;
  allergies?: string[];
  medications?: string[];
  medical_conditions?: string[];
  previous_surgeries?: string;
  smoking?: boolean;
  alcohol?: boolean;
  pregnant?: boolean;
  diabetic?: boolean;
  hypertensive?: boolean;
  heart_condition?: boolean;
  notes?: string;
}

export function MedicalHistoryForm({ patientId }: { patientId: string }) {
  const [data, setData] = useState<MedicalHistory>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newAllergy, setNewAllergy] = useState("");
  const [newMed, setNewMed] = useState("");
  const [newCondition, setNewCondition] = useState("");

  useEffect(() => {
    fetch(`/api/dental/medical-history/${patientId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [patientId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/dental/medical-history/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleArray(field: keyof MedicalHistory, value: string) {
    const arr = (data[field] as string[]) ?? [];
    setData(d => ({ ...d, [field]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] }));
  }

  function addCustom(field: keyof MedicalHistory, value: string, reset: () => void) {
    if (!value.trim()) return;
    const arr = (data[field] as string[]) ?? [];
    if (!arr.includes(value.trim())) setData(d => ({ ...d, [field]: [...arr, value.trim()] }));
    reset();
  }

  if (loading) return <div className="animate-pulse h-48 bg-muted rounded-xl" />;

  const hasAlerts = data.allergies?.length || data.diabetic || data.heart_condition || data.hypertensive;

  return (
    <div className="space-y-5">
      {/* Alert banner */}
      {hasAlerts && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex gap-2">
          <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-700 space-y-0.5">
            <p className="font-semibold">Medical Alerts</p>
            {data.allergies?.length ? <p>⚠️ Allergies: {data.allergies.join(", ")}</p> : null}
            {data.diabetic && <p>⚠️ Diabetic patient</p>}
            {data.hypertensive && <p>⚠️ Hypertensive patient</p>}
            {data.heart_condition && <p>⚠️ Heart condition</p>}
          </div>
        </div>
      )}

      {/* Blood type + checkboxes */}
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Blood Type</label>
          <div className="flex flex-wrap gap-1.5">
            {BLOOD_TYPES.map(bt => (
              <button key={bt} onClick={() => setData(d => ({ ...d, blood_type: bt }))}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${data.blood_type === bt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {bt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Conditions</label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { key: "diabetic", label: "Diabetic" },
              { key: "hypertensive", label: "Hypertensive" },
              { key: "heart_condition", label: "Heart Condition" },
              { key: "smoking", label: "Smoker" },
              { key: "alcohol", label: "Alcohol" },
              { key: "pregnant", label: "Pregnant" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!(data as Record<string, unknown>)[key]}
                  onChange={e => setData(d => ({ ...d, [key]: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Allergies */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Drug Allergies</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {COMMON_ALLERGIES.map(a => (
            <button key={a} onClick={() => toggleArray("allergies", a)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${(data.allergies ?? []).includes(a) ? "bg-red-500 text-white border-red-500" : "border-border hover:bg-muted"}`}>
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newAllergy} onChange={e => setNewAllergy(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustom("allergies", newAllergy, () => setNewAllergy(""))}
            placeholder="Add custom allergy..."
            className="flex-1 rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <button onClick={() => addCustom("allergies", newAllergy, () => setNewAllergy(""))}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Add</button>
        </div>
        {(data.allergies ?? []).filter(a => !COMMON_ALLERGIES.includes(a)).map(a => (
          <span key={a} className="inline-flex items-center gap-1 mt-1.5 me-1.5 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs">
            {a}
            <button onClick={() => toggleArray("allergies", a)} className="hover:text-red-900">×</button>
          </span>
        ))}
      </div>

      {/* Current medications */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Current Medications</label>
        <div className="flex gap-2 mb-2">
          <input value={newMed} onChange={e => setNewMed(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustom("medications", newMed, () => setNewMed(""))}
            placeholder="e.g. Aspirin 100mg daily..."
            className="flex-1 rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <button onClick={() => addCustom("medications", newMed, () => setNewMed(""))}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(data.medications ?? []).map(m => (
            <span key={m} className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs">
              {m}
              <button onClick={() => toggleArray("medications", m)} className="hover:text-blue-900">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Medical conditions */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Medical Conditions</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {COMMON_CONDITIONS.map(c => (
            <button key={c} onClick={() => toggleArray("medical_conditions", c)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${(data.medical_conditions ?? []).includes(c) ? "bg-orange-500 text-white border-orange-500" : "border-border hover:bg-muted"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Previous surgeries + notes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Previous Surgeries</label>
          <textarea value={data.previous_surgeries ?? ""} onChange={e => setData(d => ({ ...d, previous_surgeries: e.target.value }))}
            rows={2} placeholder="e.g. Appendectomy 2019..."
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none resize-none" />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Additional Notes</label>
          <textarea value={data.notes ?? ""} onChange={e => setData(d => ({ ...d, notes: e.target.value }))}
            rows={2} placeholder="Any other relevant info..."
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none resize-none" />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {saved ? "✓ Saved!" : "Save Medical History"}
      </button>
    </div>
  );
}