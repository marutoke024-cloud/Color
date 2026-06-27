import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const onGallery = location.pathname === "/";

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Opal Folio — home">
          <span className="brand-mark">Opal Folio</span>
          <span className="brand-sub">color studies</span>
        </Link>
        <nav className="nav-actions">
          {onGallery ? (
            <>
              <Link to="/cloud" className="btn">
                Cloud
              </Link>
              <Link to="/create" className="btn btn-primary">
                New study
              </Link>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              ← Back
            </button>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
