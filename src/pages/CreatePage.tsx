import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  composeWork,
  downscaleToDataUrl,
  extractPalette,
  fileToDataUrl,
  loadImage,
  stylize,
} from "../lib/imageProcessing";
import { newId, saveWork, type Work } from "../lib/db";

export default function CreatePage() {
  const navigate = useNavigate();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [composite, setComposite] = useState<string | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [strength, setStrength] = useState(0.55);
  const [saturation, setSaturation] = useState(1.12);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const process = useCallback(
    async (strengthV: number, saturationV: number) => {
      const img = imgRef.current;
      if (!img) return;
      setBusy(true);
      // Yield so the spinner can paint before the synchronous canvas work.
      await new Promise((r) => requestAnimationFrame(r));
      const artwork = stylize(img, { strength: strengthV, saturation: saturationV });
      const pal = extractPalette(artwork);
      const comp = composeWork(artwork, pal);
      setPalette(pal);
      setComposite(comp);
      setBusy(false);
    },
    []
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const dataUrl = await fileToDataUrl(file);
      const img = await loadImage(dataUrl);
      imgRef.current = img;
      setOriginalDataUrl(downscaleToDataUrl(img));
      await process(strength, saturation);
    },
    [process, strength, saturation]
  );

  function onStrength(v: number) {
    setStrength(v);
    process(v, saturation);
  }
  function onSaturation(v: number) {
    setSaturation(v);
    process(strength, v);
  }

  async function save() {
    if (!composite || !originalDataUrl) return;
    const work: Work = {
      id: newId(),
      createdAt: Date.now(),
      compositeDataUrl: composite,
      originalDataUrl,
      palette,
    };
    await saveWork(work);
    navigate(`/work/${work.id}`);
  }

  function copyHex(hex: string) {
    navigator.clipboard?.writeText(hex);
    setToast(`Copied ${hex}`);
    setTimeout(() => setToast(null), 1400);
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">New study</h1>
          <p className="page-subtitle">
            Stylise a photograph and pull a five-colour palette from it.
          </p>
        </div>
      </div>

      <div className="create-grid">
        <div>
          {!originalDataUrl ? (
            <label
              className={`dropzone${drag ? " drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <strong>Drop a photo here</strong>
              <small>or click to browse · JPG / PNG</small>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          ) : (
            <div className="composite-frame" style={{ position: "relative" }}>
              {composite && <img src={composite} alt="Stylised study preview" />}
              {busy && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.45)",
                  }}
                >
                  <div className="spinner" />
                </div>
              )}
            </div>
          )}

          {originalDataUrl && (
            <p className="field-note">
              The cut-out is a stylised, flattened rendering of your photo. The
              five swatches below are sampled from the result and laid in as a band
              beneath the artwork.
            </p>
          )}
        </div>

        <div>
          {originalDataUrl ? (
            <>
              <div className="control-row">
                <label>
                  <span>Stylise strength</span>
                  <span>{Math.round(strength * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={strength}
                  onChange={(e) => onStrength(parseFloat(e.target.value))}
                />
              </div>
              <div className="control-row">
                <label>
                  <span>Saturation</span>
                  <span>{saturation.toFixed(2)}×</span>
                </label>
                <input
                  type="range"
                  min={0.6}
                  max={1.5}
                  step={0.01}
                  value={saturation}
                  onChange={(e) => onSaturation(parseFloat(e.target.value))}
                />
              </div>

              <div className="swatch-row">
                {palette.map((hex, i) => (
                  <div className="swatch" key={`${hex}-${i}`}>
                    <div className="chip" style={{ background: hex }} />
                    <div className="hex" onClick={() => copyHex(hex)} title="Copy">
                      {hex}
                    </div>
                  </div>
                ))}
              </div>

              <div className="action-bar">
                <button className="btn btn-primary" onClick={save} disabled={busy || !composite}>
                  Save to folio
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    imgRef.current = null;
                    setOriginalDataUrl(null);
                    setComposite(null);
                    setPalette([]);
                  }}
                >
                  Choose another
                </button>
              </div>
            </>
          ) : (
            <p className="field-note">
              Pick a photograph to begin. Everything is processed locally in your
              browser and saved only to this device.
            </p>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
