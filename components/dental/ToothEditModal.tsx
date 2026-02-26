"use client";
import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import type { ToothData, ToothCondition } from "./ToothChart";
import { CONDITION_LABELS } from "./ToothChart";

interface ToothEditModalProps {
  toothNumber: number;
  current: ToothData | null;
  onSave: (conditions: ToothCondition[], notes: string) => void;
  onClose: () => void;
}

const ALL_CONDITIONS: ToothCondition[] = [
  "healthy",
  "cavity",
  "filled",
  "crown",
  "root_canal",
  "missing",
  "implant",
  "cracked",
  "bridge",
];

export function ToothEditModal({
  toothNumber,
  current,
  onSave,
  onClose,
}: ToothEditModalProps) {
  const [conditions, setConditions] = useState<ToothCondition[]>(
    current?.conditions ?? []
  );
  const [notes, setNotes] = useState(current?.notes ?? "");

  useEffect(() => {
    setConditions(current?.conditions ?? []);
    setNotes(current?.notes ?? "");
  }, [toothNumber, current]);

  function toggleCondition(c: ToothCondition) {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  function handleSave() {
    onSave(conditions.length ? conditions : ["healthy"], notes);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md border">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">Tooth #{toothNumber}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Conditions
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_CONDITIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCondition(c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    conditions.includes(c)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background resize-none"
              placeholder="Optional notes..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 flex items-center gap-2"
          >
            <Save className="size-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
