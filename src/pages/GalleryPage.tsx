import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CylinderGallery from "../components/CylinderGallery";
import { getAllWorks, saveWork, type Work } from "../lib/db";
import { buildSampleWorks } from "../lib/samples";

type View = "carousel" | "grid";

export default function GalleryPage() {
  const [works, setWorks] = useState<Work[] | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [view, setView] = useState<View>("carousel");
  const navigate = useNavigate();

  useEffect(() => {
    getAllWorks().then(setWorks);
  }, []);

  async function loadSamples() {
    setSeeding(true);
    try {
      const samples = buildSampleWorks();
      for (const w of samples) await saveWork(w);
      setWorks(await getAllWorks());
    } finally {
      setSeeding(false);
    }
  }

  if (works === null) {
    return (
      <div className="center-load">
        <div className="spinner" />
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <>
        <div className="gallery-logo">
          <div className="logo-main">Opal&nbsp;Folio</div>
          <div className="logo-sub">color studies</div>
        </div>
        <div className="empty-state">
          <h2>Your folio is empty</h2>
          <p>
            Turn a photograph into a stylised study with a five-colour palette, and
            it will take its place on the carousel here.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Link to="/create" className="btn btn-primary">
              Create a study
            </Link>
            <button className="btn" onClick={loadSamples} disabled={seeding}>
              {seeding ? "Loading…" : "Load sample set"}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {view === "carousel" ? (
        <>
          {/* Background wordmark — present behind the cards. */}
          <div className="gallery-logo">
            <div className="logo-main">Opal&nbsp;Folio</div>
            <div className="logo-sub">color studies</div>
          </div>
          <CylinderGallery works={works} />
          <div className="gallery-hint">
            <span className="rule" />
            Scroll or drag to turn
            <span className="rule" />
          </div>
        </>
      ) : (
        <div className="grid-view">
          <div className="grid-wrap">
            {works.map((w) => (
              <button
                key={w.id}
                className="grid-card"
                onClick={() => navigate(`/work/${w.id}`)}
                aria-label={w.title ?? "Open study"}
              >
                <img src={w.compositeDataUrl} alt={w.title ?? "Study"} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom-left view toggle. */}
      <button
        className="view-toggle"
        onClick={() => setView((v) => (v === "carousel" ? "grid" : "carousel"))}
      >
        {view === "carousel" ? (
          <>
            <GridIcon /> All works
          </>
        ) : (
          <>
            <RingIcon /> Carousel
          </>
        )}
      </button>

      <div className="gallery-count">
        {works.length.toString().padStart(2, "0")} {works.length === 1 ? "study" : "studies"}
      </div>
    </>
  );
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="5" height="5" rx="1" stroke="currentColor" />
      <rect x="7.5" y="0.5" width="5" height="5" rx="1" stroke="currentColor" />
      <rect x="0.5" y="7.5" width="5" height="5" rx="1" stroke="currentColor" />
      <rect x="7.5" y="7.5" width="5" height="5" rx="1" stroke="currentColor" />
    </svg>
  );
}

function RingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <ellipse cx="6.5" cy="6.5" rx="6" ry="3" stroke="currentColor" />
      <circle cx="6.5" cy="3.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
