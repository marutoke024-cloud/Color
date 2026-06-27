import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CylinderGallery from "../components/CylinderGallery";
import { getAllWorks, saveWork, type Work } from "../lib/db";
import { buildSampleWorks } from "../lib/samples";

export default function GalleryPage() {
  const [works, setWorks] = useState<Work[] | null>(null);
  const [seeding, setSeeding] = useState(false);

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

  return (
    <>
      {/* Background wordmark — always present behind the cards. */}
      <div className="gallery-logo">
        <div className="logo-main">Opal&nbsp;Folio</div>
        <div className="logo-sub">color studies</div>
      </div>

      {works.length === 0 ? (
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
      ) : (
        <>
          <CylinderGallery works={works} />
          <div className="gallery-hint">
            <span className="rule" />
            Scroll or drag to turn
            <span className="rule" />
          </div>
          <div className="gallery-count">
            {works.length.toString().padStart(2, "0")} {works.length === 1 ? "study" : "studies"}
          </div>
        </>
      )}
    </>
  );
}
