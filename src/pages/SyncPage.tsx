import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllWorks } from "../lib/db";
import {
  backupWorks,
  clearFirebaseConfig,
  getFirebaseConfig,
  isConfigured,
  onUserChange,
  restoreWorks,
  saveFirebaseConfig,
  signInWithGoogle,
  signOutUser,
  type FirebaseConfig,
  type User,
} from "../lib/firebase";

const EMPTY: FirebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  appId: "",
};

export default function SyncPage() {
  const [configured, setConfigured] = useState(isConfigured());
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [paste, setPaste] = useState("");

  useEffect(() => {
    if (!configured) return;
    const unsub = onUserChange(setUser);
    return unsub;
  }, [configured]);

  function applyConfig() {
    try {
      // Accept a pasted JSON blob or a JS `const firebaseConfig = {…}` object.
      // Evaluate the object literal directly so unquoted keys and colon-bearing
      // string values (e.g. appId "1:123:web:abc") parse cleanly.
      const start = paste.indexOf("{");
      const end = paste.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("no object");
      const body = paste.slice(start, end + 1);
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const parsed = new Function(`return (${body})`)() as Partial<FirebaseConfig>;
      const cfg: FirebaseConfig = { ...EMPTY, ...parsed };
      if (!cfg.apiKey || !cfg.projectId || !cfg.storageBucket) {
        setMsg({ text: "Missing apiKey, projectId or storageBucket.", error: true });
        return;
      }
      saveFirebaseConfig(cfg);
      setConfigured(true);
      setMsg({ text: "Firebase connected. Sign in to sync." });
    } catch {
      setMsg({ text: "Could not parse that config. Paste the firebaseConfig object.", error: true });
    }
  }

  async function signIn() {
    setBusy(true);
    setMsg(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setMsg({ text: errText(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function backup() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const works = await getAllWorks();
      const n = await backupWorks(user.uid, works, (d, t) =>
        setMsg({ text: `Uploading ${d} / ${t}…` })
      );
      setMsg({ text: `Backed up ${n} ${n === 1 ? "study" : "studies"} to the cloud.` });
    } catch (e) {
      setMsg({ text: errText(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const existing = new Set((await getAllWorks()).map((w) => w.id));
      const n = await restoreWorks(user.uid, existing, (d, t) =>
        setMsg({ text: `Downloading ${d} / ${t}…` })
      );
      setMsg({
        text:
          n === 0
            ? "Already up to date — nothing new to restore."
            : `Restored ${n} ${n === 1 ? "study" : "studies"} to this device.`,
      });
    } catch (e) {
      setMsg({ text: errText(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const cfg = getFirebaseConfig();

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Cloud sync</h1>
          <p className="page-subtitle">
            Back your folio up to Firebase Storage and restore it on another device.
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="cloud-card">
          <div className="cloud-status">
            <span className="cloud-dot" /> Not connected
          </div>
          <p className="cloud-note">
            Paste the <code>firebaseConfig</code> object from your Firebase
            project (Project settings → Your apps → Web app). It is stored only
            in this browser.
          </p>
          <div className="field">
            <label>firebaseConfig</label>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={`{\n  apiKey: "…",\n  authDomain: "your-app.firebaseapp.com",\n  projectId: "your-app",\n  storageBucket: "your-app.appspot.com",\n  appId: "…"\n}`}
            />
          </div>
          <div className="action-bar">
            <button className="btn btn-primary" onClick={applyConfig} disabled={!paste.trim()}>
              Connect
            </button>
          </div>
          <p className="cloud-note">
            In the Firebase console, enable <strong>Google</strong> sign-in
            (Authentication) and <strong>Storage</strong>, and allow this site's
            origin. See the README for the Storage security rule and CORS notes.
          </p>
        </div>
      ) : (
        <div className="cloud-card">
          <div className="cloud-status">
            <span className={`cloud-dot${user ? " on" : ""}`} />
            {user ? `Signed in as ${user.email ?? user.uid}` : "Connected · not signed in"}
          </div>
          <p className="cloud-note">
            Project <code>{cfg?.projectId}</code>
          </p>

          {!user ? (
            <div className="action-bar">
              <button className="btn btn-primary" onClick={signIn} disabled={busy}>
                Sign in with Google
              </button>
              <button className="btn btn-ghost" onClick={() => { clearFirebaseConfig(); setConfigured(false); }}>
                Change project
              </button>
            </div>
          ) : (
            <>
              <div className="action-bar">
                <button className="btn btn-primary" onClick={backup} disabled={busy}>
                  Back up to cloud
                </button>
                <button className="btn" onClick={restore} disabled={busy}>
                  Restore from cloud
                </button>
                <button className="btn btn-ghost" onClick={() => signOutUser()} disabled={busy}>
                  Sign out
                </button>
              </div>
              <p className="cloud-note">
                <strong>Back up</strong> uploads every study on this device.
                <strong> Restore</strong> downloads any studies in the cloud that
                aren't here yet — sign in with the same account on another device
                to bring your folio across. Then open the{" "}
                <Link to="/" style={{ textDecoration: "underline" }}>
                  gallery
                </Link>
                .
              </p>
            </>
          )}

          {msg && <div className={`cloud-msg${msg.error ? " error" : ""}`}>{msg.text}</div>}
        </div>
      )}

      {!configured && msg && (
        <div className={`cloud-msg${msg.error ? " error" : ""}`} style={{ maxWidth: 560 }}>
          {msg.text}
        </div>
      )}
    </main>
  );
}

function errText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const m = e instanceof Error ? e.message : String(e);
  if (code === "auth/operation-not-allowed" || m.includes("operation-not-allowed")) {
    return "Google sign-in isn't enabled for this Firebase project. In the Firebase console open Authentication → Sign-in method, and enable the Google provider.";
  }
  if (code === "auth/unauthorized-domain" || m.includes("unauthorized-domain")) {
    return "This site's domain isn't authorised. In the Firebase console add it under Authentication → Settings → Authorized domains.";
  }
  if (code === "auth/configuration-not-found" || m.includes("configuration-not-found")) {
    return "Authentication isn't set up on this project yet. Enable Authentication (and the Google provider) in the Firebase console.";
  }
  if (m.includes("popup")) return "Sign-in popup was blocked or closed.";
  if (m.toLowerCase().includes("cors")) return "Blocked by CORS — configure your Storage bucket's CORS (see README).";
  return m;
}
