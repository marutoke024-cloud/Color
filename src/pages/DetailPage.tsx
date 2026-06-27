import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteWork, getWork, saveWork, type Work } from "../lib/db";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [work, setWork] = useState<Work | null | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [gray, setGray] = useState(false);

  useEffect(() => {
    if (!id) return;
    getWork(id).then((w) => setWork(w ?? null));
  }, [id]);

  function copyHex(hex: string) {
    navigator.clipboard?.writeText(hex);
    setToast(`Copied ${hex}`);
    setTimeout(() => setToast(null), 1400);
  }

  async function remove() {
    if (!work) return;
    if (!confirm("Remove this study from your folio?")) return;
    await deleteWork(work.id);
    navigate("/");
  }

  async function toggleLock() {
    if (!work) return;
    const updated = { ...work, locked: !work.locked };
    await saveWork(updated);
    setWork(updated);
    setToast(updated.locked ? "Locked — hidden unless Private mode is on" : "Unlocked");
    setTimeout(() => setToast(null), 1800);
  }

  if (work === undefined) {
    return (
      <div className="center-load">
        <div className="spinner" />
      </div>
    );
  }

  if (work === null) {
    return (
      <main className="page">
        <h1 className="page-title">Not found</h1>
        <p className="page-subtitle">This study is no longer in your folio.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{work.title ?? "Untitled study"}</h1>
          <p className="page-subtitle">
            {formatDate(work.createdAt)}
            {work.locked && <span className="lock-badge">🔒 Locked</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={`btn${gray ? " active" : ""}`}
            onClick={() => setGray((g) => !g)}
            title="Drop the colour to compare values"
          >
            {gray ? "● Color" : "◐ Grayscale"}
          </button>
          <button className="btn" onClick={toggleLock}>
            {work.locked ? "🔓 Unlock" : "🔒 Lock"}
          </button>
          <button className="btn btn-danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="composite-frame">
          <img
            className={gray ? "grayscale" : undefined}
            src={work.compositeDataUrl}
            alt={work.title ?? "Study"}
          />
        </div>

        <div>
          <dl className="detail-meta">
            <dt>Palette</dt>
            <dd>
              <div className="palette-list">
                {work.palette.map((hex, i) => (
                  <div
                    className="palette-item"
                    key={`${hex}-${i}`}
                    onClick={() => copyHex(hex)}
                  >
                    <span className="chip" style={{ background: hex }} />
                    <span className="hex">{hex}</span>
                    <span className="copy-tag">Copy</span>
                  </div>
                ))}
              </div>
            </dd>

            <dt>Source photograph</dt>
            <dd>
              <div className="original-shot">
                <img
                  className={gray ? "grayscale" : undefined}
                  src={work.originalDataUrl}
                  alt="Original source"
                />
              </div>
            </dd>

            <dt>Created</dt>
            <dd>{formatDate(work.createdAt)}</dd>
          </dl>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
