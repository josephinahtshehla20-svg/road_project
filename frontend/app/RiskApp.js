"use client";
import { useEffect, useState } from "react";

const OPTIONS = {
  road_type: ["highway", "rural", "urban"],
  num_lanes: [1, 2, 3, 4],
  speed_limit: [25, 35, 45, 60, 70],
  lighting: ["daylight", "dim", "night"],
  weather: ["clear", "foggy", "rainy"],
  time_of_day: ["morning", "afternoon", "evening"],
};
const LABELS = {
  road_type: "Road type", num_lanes: "Lanes", speed_limit: "Speed limit (mph)",
  lighting: "Lighting", weather: "Weather", time_of_day: "Time of day",
};
const EXAMPLES = {
  "Safe road": { road_type: "urban", num_lanes: 2, curvature: 0.1, speed_limit: 25, lighting: "daylight", weather: "clear",
    road_signs_present: true, public_road: true, time_of_day: "afternoon", holiday: false, school_season: false, num_reported_accidents: 0 },
  "Typical road": { road_type: "rural", num_lanes: 2, curvature: 0.5, speed_limit: 45, lighting: "daylight", weather: "clear",
    road_signs_present: true, public_road: true, time_of_day: "afternoon", holiday: false, school_season: false, num_reported_accidents: 1 },
  "Dangerous road": { road_type: "highway", num_lanes: 2, curvature: 0.9, speed_limit: 70, lighting: "night", weather: "foggy",
    road_signs_present: false, public_road: true, time_of_day: "evening", holiday: false, school_season: false, num_reported_accidents: 3 },
};
const LEVEL_COLOR = { Low: "#3FB37F", Moderate: "#F4C430", High: "#F08A3C", Severe: "#E5484D" };

export default function RiskApp({ api }) {
  const API = api;
  const [form, setForm] = useState(EXAMPLES["Typical road"]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [me, setMe] = useState("");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function logout() {
    localStorage.removeItem("road_token");
    localStorage.removeItem("road_email");
    setToken(null);
    setMe("");
    setHistory([]);
  }

  async function loadHistory() {
    if (!token) { setHistory([]); return; }
    try {
      const r = await fetch(`${API}/history?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { logout(); return; }
      if (r.ok) setHistory(await r.json());
    } catch {
      /* history is optional, ignore network errors here */
    }
  }
  useEffect(() => {
    const t = localStorage.getItem("road_token");
    if (t) { setToken(t); setMe(localStorage.getItem("road_email") || ""); }
  }, []);
  useEffect(() => { loadHistory(); }, [token]);

  async function submitAuth(mode) {
    setAuthError("");
    try {
      const r = await fetch(`${API}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });
      const j = await r.json();
      if (!r.ok) {
        setAuthError(typeof j.detail === "string" ? j.detail : "Check your email and use a password of 8 to 72 characters.");
        return;
      }
      localStorage.setItem("road_token", j.access_token);
      localStorage.setItem("road_email", j.email);
      setToken(j.access_token);
      setMe(j.email);
      setAuthForm({ email: "", password: "" });
    } catch {
      setAuthError("Could not reach the backend. Check that it is running.");
    }
  }

  async function predict(data) {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/predict`, {
        method: "POST",
        headers: token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (r.status === 401) { logout(); throw new Error("Your session expired. Please log in again, then predict again."); }
      if (!r.ok) throw new Error("The server rejected these inputs. Check the values.");
      setResult(await r.json());
      loadHistory();
    } catch (e) {
      setError(e instanceof TypeError ? "Could not reach the backend. Check that it is running on port 8000." : e.message);
    } finally {
      setLoading(false);
    }
  }

  function useExample(name) {
    setForm(EXAMPLES[name]);
    predict(EXAMPLES[name]);
  }

  const select = (key) => (
    <div className="field">
      <label htmlFor={key}>{LABELS[key]}</label>
      <select id={key} value={form[key]}
        onChange={(e) => set(key, typeof OPTIONS[key][0] === "number" ? Number(e.target.value) : e.target.value)}>
        {OPTIONS[key].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  const check = (key, label) => (
    <label className="check">
      <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
      {label}
    </label>
  );
  const maxEffect = result ? Math.max(0.05, ...result.drivers.map((d) => Math.abs(d.effect))) : 0.05;

  return (
    <main>
      <h1>How risky is this stretch of road?</h1>
      <p className="sub">Describe the road, the weather and the time of day. The model estimates an accident risk score from 0 (safest) to 1.</p>

      <div className="grid">
        <form className="card" onSubmit={(e) => { e.preventDefault(); predict(form); }}>
          <div className="examples">
            <span>Try an example:</span>
            {Object.keys(EXAMPLES).map((n) => (
              <button type="button" className="ex" key={n} onClick={() => useExample(n)}>{n}</button>
            ))}
          </div>

          <h2>Road</h2>
          <div className="row">{select("road_type")}{select("num_lanes")}</div>
          {select("speed_limit")}
          <div className="field">
            <label htmlFor="curvature">Curvature: <b>{form.curvature.toFixed(2)}</b> (0 straight, 1 very curved)</label>
            <input id="curvature" type="range" min="0" max="1" step="0.01" value={form.curvature}
              onChange={(e) => set("curvature", Number(e.target.value))} />
          </div>
          <div className="checks">{check("road_signs_present", "Road signs present")}{check("public_road", "Public road")}</div>

          <h2>Conditions</h2>
          <div className="row">{select("weather")}{select("lighting")}</div>
          <div className="row">
            {select("time_of_day")}
            <div className="field">
              <label htmlFor="acc">Past reported accidents</label>
              <input id="acc" type="number" min="0" max="10" value={form.num_reported_accidents}
                onChange={(e) => set("num_reported_accidents", Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />
            </div>
          </div>
          <div className="checks">{check("holiday", "Holiday")}{check("school_season", "School season")}</div>

          <button type="submit" className="primary" disabled={loading}>{loading ? "Predicting..." : "Predict risk"}</button>
          {error && <div className="err" role="alert">{error}</div>}
        </form>

        <section className="card" aria-live="polite">
          {!result ? (
            <p className="empty">Set the conditions and select Predict risk to see a score.</p>
          ) : (
            <div>
              <span className="score">{result.risk.toFixed(2)}</span>
              <span className="lvl" style={{ color: LEVEL_COLOR[result.level] }}>{result.level} risk</span>
              <div className="road"><div className="pin" style={{ left: `${Math.min(result.risk, 1) * 100}%` }} /></div>
              <div className="scale"><span>0 safest</span><span>1 riskiest</span></div>
              <h3>What moves this score</h3>
              <ul className="drv">
                {result.drivers.length === 0 && <li className="empty">These inputs are close to a typical road.</li>}
                {result.drivers.map((d) => {
                  const w = (Math.abs(d.effect) / maxEffect) * 50;
                  const up = d.effect > 0;
                  return (
                    <li key={d.feature}>
                      <span>{d.feature}</span>
                      <span className="bar"><i style={up ? { left: "50%", width: `${w}%`, background: "#E5484D" } : { right: "50%", width: `${w}%`, background: "#3FB37F" }} /></span>
                      <span>{up ? "+" : ""}{d.effect.toFixed(2)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="note">{result.saved ? "Saved to your history." : "Not saved. Log in below to keep a history of your predictions."}</p>
              <p className="note">Bars compare each input with a typical road (45 mph, clear weather, daylight, 1 past accident). Red raises risk, green lowers it.</p>
            </div>
          )}
        </section>
      </div>

      <section className="card history">
        <div className="histhead">
          <h2>{token ? "My history (saved in PostgreSQL)" : "Log in to keep a history"}</h2>
          {token && (
            <div className="who"><span>{me}</span><button type="button" className="ex" onClick={logout}>Log out</button></div>
          )}
        </div>
        {!token ? (
          <form onSubmit={(e) => { e.preventDefault(); submitAuth("login"); }}>
            <p className="empty">The predictor is open to everyone. Create an account to save your predictions and see only your own.</p>
            <div className="row">
              <div className="field">
                <label htmlFor="em">Email</label>
                <input id="em" type="email" autoComplete="email" required value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pw">Password (8 to 72 characters)</label>
                <input id="pw" type="password" autoComplete="current-password" required minLength={8} maxLength={72} value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
              </div>
            </div>
            <div className="authbtns">
              <button type="submit" className="primary small">Log in</button>
              <button type="button" className="ex" onClick={() => submitAuth("register")}>Create account</button>
            </div>
            {authError && <div className="err" role="alert">{authError}</div>}
          </form>
        ) : history.length === 0 ? (
          <p className="empty">No saved predictions yet. Run a prediction and it will appear here.</p>
        ) : (
          <table>
            <thead><tr><th>Time</th><th>Road</th><th>Risk</th><th>Level</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleTimeString()}</td>
                  <td>{h.inputs.road_type}, {h.inputs.speed_limit} mph, {h.inputs.lighting}, {h.inputs.weather}</td>
                  <td>{h.risk.toFixed(2)}</td>
                  <td style={{ color: LEVEL_COLOR[h.level], fontWeight: 700 }}>{h.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
