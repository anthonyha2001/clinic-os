"use client";
import { useState, useEffect, useRef } from "react";
import { Upload, X, ZoomIn, Loader2, Image as ImageIcon } from "lucide-react";

interface Xray {
  id: string;
  file_url: string;
  file_name: string;
  tooth_number?: number;
  xray_type?: string;
  notes?: string;
  taken_at: string;
}

export function XrayUploader({ patientId }: { patientId: string }) {
  const [xrays, setXrays] = useState<Xray[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Xray | null>(null);
  const [uploadForm, setUploadForm] = useState({ tooth_number: "", xray_type: "periapical", notes: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const XRAY_TYPES = ["periapical", "bitewing", "panoramic", "cephalometric", "CBCT"];

  useEffect(() => {
    fetch(`/api/dental/xrays/${patientId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setXrays(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [patientId]);

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("patient_id", patientId);

    const uploadRes = await fetch("/api/dental/xrays/uploads", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!uploadRes.ok) { setUploading(false); return; }
    const { url, name } = await uploadRes.json();

    const saveRes = await fetch(`/api/dental/xrays/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        file_url: url,
        file_name: name,
        tooth_number: uploadForm.tooth_number ? parseInt(uploadForm.tooth_number) : null,
        xray_type: uploadForm.xray_type,
        notes: uploadForm.notes || null,
      }),
    });

    if (saveRes.ok) {
      const saved = await saveRes.json();
      setXrays(x => [saved, ...x]);
      setPendingFile(null);
      setUploadForm({ tooth_number: "", xray_type: "periapical", notes: "" });
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setPendingFile(f); }}
      >
        <input ref={fileRef} type="file" accept="image/*,.dcm" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) setPendingFile(f); }} />
        <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">Drop X-ray here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">JPG, PNG, DICOM supported</p>
      </div>

      {/* Pending file form */}
      {pendingFile && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              <span className="text-sm font-medium truncate max-w-xs">{pendingFile.name}</span>
            </div>
            <button onClick={() => setPendingFile(null)}><X className="size-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tooth # (optional)</label>
              <input type="number" placeholder="e.g. 16" value={uploadForm.tooth_number}
                onChange={e => setUploadForm(f => ({ ...f, tooth_number: e.target.value }))}
                className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select value={uploadForm.xray_type} onChange={e => setUploadForm(f => ({ ...f, xray_type: e.target.value }))}
                className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none">
                {XRAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <input placeholder="Optional notes" value={uploadForm.notes}
                onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none" />
            </div>
          </div>
          <button onClick={handleUpload} disabled={uploading}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading ? <><Loader2 className="size-4 animate-spin" /> Uploading...</> : <><Upload className="size-4" /> Save X-ray</>}
          </button>
        </div>
      )}

      {/* X-ray grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : xrays.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No X-rays uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {xrays.map(xray => (
            <div key={xray.id} className="relative group rounded-xl overflow-hidden border bg-black cursor-pointer"
              onClick={() => setPreview(xray)}>
              <img src={xray.file_url} alt={xray.file_name} className="w-full h-32 object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="size-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <p className="text-white text-xs font-medium truncate">
                  {xray.tooth_number ? `Tooth #${xray.tooth_number} · ` : ""}{xray.xray_type}
                </p>
                <p className="text-white/70 text-[10px]">{new Date(xray.taken_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {preview && (
        <>
          <div className="fixed inset-0 z-50 bg-black/90" onClick={() => setPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto max-w-3xl w-full space-y-2">
              <div className="flex items-center justify-between text-white">
                <div>
                  <p className="font-semibold">{preview.file_name}</p>
                  <p className="text-sm text-white/60">
                    {preview.tooth_number ? `Tooth #${preview.tooth_number} · ` : ""}{preview.xray_type} · {new Date(preview.taken_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setPreview(null)} className="p-2 hover:bg-white/10 rounded-lg">
                  <X className="size-5" />
                </button>
              </div>
              <img src={preview.file_url} alt={preview.file_name} className="w-full rounded-xl max-h-[70vh] object-contain bg-black" />
              {preview.notes && <p className="text-white/60 text-sm">{preview.notes}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}