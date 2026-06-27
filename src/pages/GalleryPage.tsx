import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CylinderGallery from "../components/CylinderGallery";
import {
  getAllWorks,
  getPrivateMode,
  saveWork,
  setPrivateMode,
  type Work,
} from "../lib/db";
import { buildSampleWorks } from "../lib/samples";

type View = "carousel" | "grid";

export default function GalleryPage() {
  const [works, setWorks] = useState<Work[] | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [view, setView] = useState<View>("carousel");
  const [fadingOut, setFadingOut] = useState(false);
  const [privateMode, setPrivate] = useState(getPrivateMode());
  const navigate = useNavigate();

  // Loading overlay (covers the DB read lag for large folios), with fade-out.
  const [overlayMounted, setOverlayMounted] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const switchTimer = useRef<number | null>(null);

  useEffect(() => {
    getAllWorks().then((w) => {
      setWorks(w);
      // Fade the loading screen out once the data is in.
      requestAnimationFrame(() => setOverlayVisible(false));
      window.setTimeout(() => setOverlayMounted(false), 550);
    });
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

  function switchView(next: View) {
    if (next === view) return;
    setFadingOut(true);
    if (switchTimer.current) window.clearTimeout(switchTimer.current);
    switchTimer.current = window.setTimeout(() => {
      setView(next);
      setFadingOut(false);
    }, 220);
  }

  function togglePrivate() {
    const next = !privateMode;
    setPrivate(next);
    setPrivateMode(next);
  }

  const loadingScreen = overlayMounted && (
    <div className={`loading-screen${overlayVisible ? "" : " hide"}`}>
      <div className="loading-mark">Opal&nbsp;Folio</div>
      <div className="loading-sub">
        <span className="spinner" /> Loading…
      </div>
    </div>
  );

  if (works === null) {
    return <>{loadingScreen}</>;
  }

  const visible = privateMode ? works : works.filter((w) => !w.locked);
  const hiddenCount = works.length - visible.length;

  // Empty folio entirely.
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
        {loadingScreen}
      </>
    );
  }

  // Everything is locked and Private mode is off.
  if (visible.length === 0) {
    return (
      <>
        <div className="gallery-logo">
          <div className="logo-main">Opal&nbsp;Folio</div>
          <div className="logo-sub">color studies</div>
        </div>
        <div className="empty-state">
          <h2>Nothing on display</h2>
          <p>
            {hiddenCount} locked {hiddenCount === 1 ? "study is" : "studies are"} hidden.
            Turn on Private mode to see them.
          </p>
          <button className="btn btn-primary" onClick={togglePrivate}>
            🔓 Enter Private mode
          </button>
        </div>
        {loadingScreen}
      </>
    );
  }

  return (
    <>
      <div className={`view-fade${fadingOut ? " out" : ""}`}>
        {view === "carousel" ? (
          <>
            <div className="gallery-logo">
              <div className="logo-main">Opal&nbsp;Folio</div>
              <div className="logo-sub">color studies</div>
            </div>
            <CylinderGallery works={visible} />
            <div className="gallery-hint">
              <span className="rule" />
              Scroll or drag to turn
              <span className="rule" />
            </div>
          </>
        ) : (
          <div className="grid-view">
            <div className="grid-wrap">
              {visible.map((w) => (
                <button
                  key={w.id}
                  className="grid-card"
                  onClick={() => navigate(`/work/${w.id}`)}
                  aria-label={w.title ?? "Open study"}
                >
                  {w.locked && <span className="grid-lock">🔒</span>}
                  <img src={w.compositeDataUrl} alt={w.title ?? "Study"} loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-left controls. */}
      <div className="gallery-controls">
        <button
          className="view-toggle"
          onClick={() => switchView(view === "carousel" ? "grid" : "carousel")}
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
        <button
          className={`view-toggle${privateMode ? " active" : ""}`}
          onClick={togglePrivate}
          title="Show locked studies"
        >
          {privateMode ? "🔓 Private on" : "🔒 Private"}
        </button>
      </div>

      <div className="gallery-count">
        {visible.length.toString().padStart(2, "0")} {visible.length === 1 ? "study" : "studies"}
        {privateMode && hiddenCount > 0 ? "" : null}
      </div>

      {loadingScreen}
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
