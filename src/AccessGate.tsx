import { lazy, Suspense, useEffect, useState } from "react";
const App = lazy(() => import("./main"));
interface GateConfig {
  version: 1;
  enabled: boolean;
  iterations: number;
  salt: string;
  digest: string;
}
const sessionKey = "countertop-basic-gate";
const ttl = 4 * 60 * 60 * 1000;
function bytes(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function sessionValid(config: GateConfig) {
  try {
    const s = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    return (
      s?.digest === config.digest &&
      Number.isFinite(s.at) &&
      Date.now() - s.at >= 0 &&
      Date.now() - s.at < ttl
    );
  } catch {
    return false;
  }
}
export default function AccessGate() {
  const [config, setConfig] = useState<GateConfig | null>(null),
    [unlocked, setUnlocked] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}access-gate.json`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((c: GateConfig) => {
        if (
          c.version !== 1 ||
          typeof c.enabled !== "boolean" ||
          (c.enabled &&
            (!Number.isInteger(c.iterations) ||
              c.iterations < 100000 ||
              c.iterations > 1000000 ||
              bytes(c.salt).length < 16 ||
              bytes(c.salt).length > 64 ||
              bytes(c.digest).length !== 32))
        )
          throw Error();
        if (active) {
          setConfig(c);
          setUnlocked(!c.enabled || sessionValid(c));
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError("Access settings could not be loaded. Please retry.");
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const lock = () => {
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* The in-memory screen can still be locked. */
      }
      setUnlocked(false);
      setPassword("");
    };
    window.addEventListener("countertop-lock", lock);
    return () => window.removeEventListener("countertop-lock", lock);
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const derived = new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: bytes(config.salt),
            iterations: config.iterations,
            hash: "SHA-256",
          },
          key,
          256,
        ),
      );
      const expected = bytes(config.digest);
      let difference = 0;
      derived.forEach((v, i) => {
        difference |= v ^ expected[i];
      });
      if (difference) {
        setError("Incorrect password. Please try again.");
        return;
      }
      try {
        sessionStorage.setItem(
          sessionKey,
          JSON.stringify({ digest: config.digest, at: Date.now() }),
        );
      } catch {
        /* Access can remain in memory if session storage is unavailable. */
      }
      setPassword("");
      setUnlocked(true);
    } catch {
      setError(
        "Password verification requires a browser with Web Crypto over HTTPS.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (config && (!config.enabled || unlocked))
    return (
      <Suspense
        fallback={<div className="gate-loading">Opening workspace…</div>}
      >
        <App />
      </Suspense>
    );
  return (
    <div className="gate-page">
      <main className="gate-card">
        <div className="eyebrow">COUNTERTOP CALCULATOR</div>
        <h1>
          Welcome back<span className="dot">.</span>
        </h1>
        <p>Enter the shared password to open this workspace.</p>
        {config ? (
          <form onSubmit={submit}>
            <label>
              Access password
              <input
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Checking…" : "Enter workspace"}
            </button>
          </form>
        ) : !error ? (
          <p role="status">Loading access settings…</p>
        ) : (
          <button onClick={() => setReload((n) => n + 1)}>Retry</button>
        )}
        {error && (
          <p className="validation" role="alert">
            {error}
          </p>
        )}
        <p className="gate-disclaimer">
          Basic access screen for casual visitors. This static site remains
          public; this is not secure authentication. Projects remain stored on
          this device.
        </p>
      </main>
    </div>
  );
}
