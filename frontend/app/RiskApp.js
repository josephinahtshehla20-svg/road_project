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
  road_type: "Type of road", num_lanes: "Lanes", speed_limit: "Speed limit (km/h)",
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

// The model was trained with speeds in mph, so the page shows the km/h equivalent (rounded) and sends mph.
const SPEED_KMH = { 25: 40, 35: 55, 45: 70, 60: 100, 70: 110 };
const TRIPS = [
  { id: "town", label: "Around town", hint: "Urban road, 55 km/h", set: { road_type: "urban", num_lanes: 2, speed_limit: 35, curvature: 0.2, road_signs_present: true, public_road: true, num_reported_accidents: 1 } },
  { id: "between", label: "Between towns", hint: "Rural road, 100 km/h", set: { road_type: "rural", num_lanes: 2, speed_limit: 60, curvature: 0.6, road_signs_present: true, public_road: true, num_reported_accidents: 1 } },
  { id: "highway", label: "Long highway trip", hint: "Highway, 110 km/h", set: { road_type: "highway", num_lanes: 3, speed_limit: 70, curvature: 0.3, road_signs_present: true, public_road: true, num_reported_accidents: 1 } },
  { id: "farm", label: "Farm or private road", hint: "Rural road, 40 km/h", set: { road_type: "rural", num_lanes: 1, speed_limit: 25, curvature: 0.7, road_signs_present: false, public_road: false, num_reported_accidents: 0 } },
];
// Places and routes the page knows. Each one points to a kind of trip. Add your own places here.
const PLACES = [
  ["Polokwane city centre", "town"], ["Tzaneen town centre", "town"], ["Thohoyandou town centre", "town"], ["Mokopane town centre", "town"],
  ["Musina town centre", "town"], ["Johannesburg city centre", "town"], ["Pretoria city centre", "town"],
  ["Polokwane to Johannesburg (N1)", "highway"], ["Polokwane to Musina (N1)", "highway"], ["Polokwane to Mokopane (N1)", "highway"], ["Johannesburg to Pretoria (N1)", "highway"],
  ["Polokwane to Tzaneen (R71)", "between"], ["Polokwane to Giyani", "between"], ["Polokwane to Thohoyandou", "between"], ["Tzaneen to Phalaborwa (R71)", "between"],
  ["Farm road", "farm"],
];
const matchTrip = (text) => {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const hit = PLACES.find(([n]) => n.toLowerCase() === t);
  let id = hit ? hit[1] : null;
  if (!id) {
    if (/\b(n\d+|highway|freeway|motorway)\b/.test(t)) id = "highway";
    else if (/\b(r\d+|rural)\b/.test(t)) id = "between";
    else if (/\b(farm|gravel|private)\b/.test(t)) id = "farm";
    else if (/\b(town|city|centre|center|street|suburb)\b/.test(t)) id = "town";
  }
  return id ? TRIPS.find((x) => x.id === id) : null;
};
const ROAD_LABELS = { highway: "Highway or freeway", rural: "Rural road between towns", urban: "Urban street in a city or town" };
const WHENS = [
  { id: "morning", label: "Morning", set: { time_of_day: "morning", lighting: "daylight" } },
  { id: "afternoon", label: "Afternoon", set: { time_of_day: "afternoon", lighting: "daylight" } },
  { id: "evening", label: "Evening", set: { time_of_day: "evening", lighting: "dim" } },
  { id: "night", label: "At night", set: { time_of_day: "evening", lighting: "night" } },
];
const WEATHERS = [{ id: "clear", label: "Clear" }, { id: "rainy", label: "Rain" }, { id: "foggy", label: "Fog" }];
const VERDICT = { Low: "Conditions look safe for this trip.", Moderate: "Take extra care on this trip.", High: "This trip carries a higher risk.", Severe: "This trip is very risky. Avoid it if you can." };
const TIPS = { Low: "Drive carefully as always.", Moderate: "Keep a safe distance and avoid distractions.", High: "Consider travelling in daylight, in better weather, or by a safer road.", Severe: "Postpone the trip, or choose a different time or road." };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const REASONS = {
  "Lighting": (f) => ({ night: "Driving at night", dim: "Poor light in the evening", daylight: "Good daylight" }[f.lighting]),
  "Weather": (f) => ({ foggy: "Fog", rainy: "Rain", clear: "Clear weather" }[f.weather]),
  "Speed limit": (f) => `Speed limit of about ${SPEED_KMH[f.speed_limit]} km/h`,
  "Curvature": (f) => (f.curvature >= 0.6 ? "A winding road" : f.curvature <= 0.3 ? "A fairly straight road" : "The bends in the road"),
  "Past reported accidents": (f) => `${plural(f.num_reported_accidents, "past accident")} on this road`,
  "Road type": (f) => `A ${f.road_type} road`,
  "Lanes": (f) => plural(f.num_lanes, "lane"),
  "Time of day": (f) => `Travelling in the ${f.time_of_day}`,
};
const reasonText = (feature, f) => (REASONS[feature] ? REASONS[feature](f) : feature) || feature;

export default function RiskApp({ api }) {
  const API = api;
  const [form, setForm] = useState(EXAMPLES["Typical road"]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [me, setMe] = useState("");
  const [role, setRole] = useState("user");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function logout() {
    localStorage.removeItem("road_token");
    localStorage.removeItem("road_email");
    localStorage.removeItem("road_role");
    setToken(null);
    setMe("");
    setRole("user");
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
    if (t) { setToken(t); setMe(localStorage.getItem("road_email") || ""); setRole(localStorage.getItem("road_role") || "user"); }
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
      localStorage.setItem("road_role", j.role || "user");
      setRole(j.role || "user");
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
      setResult({ ...(await r.json()), inputs: data, dest });
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
        {OPTIONS[key].map((o) => <option key={o} value={o}>{key === "speed_limit" ? `${SPEED_KMH[o]} km/h` : key === "road_type" ? ROAD_LABELS[o] : o}</option>)}
      </select>
    </div>
  );
  const check = (key, label) => (
    <label className="check">
      <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
      {label}
    </label>
  );
  const [dest, setDest] = useState("");
  const matched = dest ? matchTrip(dest) : null;
  const destNote = !dest ? "Type a place or a route, or pick one from the list."
    : matched ? `Road type for this trip: ${matched.label} (${matched.hint})`
    : "We do not know this place yet. Choose the kind of road below.";
  function changeDest(value) {
    setDest(value);
    const m = matchTrip(value);
    if (m) setForm((f) => ({ ...f, ...m.set }));
  }
  const tripId = (TRIPS.find((t) => Object.entries(t.set).every(([k, v]) => form[k] === v)) || {}).id;
  const whenId = (WHENS.find((w) => form.time_of_day === w.set.time_of_day && form.lighting === w.set.lighting) || {}).id;
  const maxEffect = result ? Math.max(0.05, ...result.drivers.map((d) => Math.abs(d.effect))) : 0.05;

  return (
    <main>
      <h1>Trip risk checker</h1>
      <p className="sub">Tell us where you are going and when. We estimate how risky the road conditions are for your trip, and what raises or lowers the risk. It is an estimate, not a promise that a crash will or will not happen.</p>

      <div className="grid">
        <form className="card" onSubmit={(e) => { e.preventDefault(); predict(form); }}>
          <div className="examples">
            <span>Try an example:</span>
            {Object.keys(EXAMPLES).map((n) => (
              <button type="button" className="ex" key={n} onClick={() => useExample(n)}>{n}</button>
            ))}
          </div>

          <h2>1. Where are you going?</h2>
          <div className="field">
            <label htmlFor="dest">Destination (optional)</label>
            <input id="dest" type="text" list="places" maxLength={80} placeholder="For example: Polokwane to Tzaneen (R71)" value={dest} onChange={(e) => changeDest(e.target.value)} />
            <datalist id="places">{PLACES.map(([n]) => <option key={n} value={n} />)}</datalist>
          </div>
          <p className="hint2">{destNote}</p>
          <p className="hint2">What kind of road will you use? You can also choose it here.</p>
          <div className="choices">
            {TRIPS.map((t) => (
              <button type="button" key={t.id} className={"choice" + (tripId === t.id ? " on" : "")} aria-pressed={tripId === t.id}
                onClick={() => setForm((f) => ({ ...f, ...t.set }))}><b>{t.label}</b><span>{t.hint}</span></button>
            ))}
          </div>

          <h2>2. When are you travelling?</h2>
          <div className="choices four">
            {WHENS.map((w) => (
              <button type="button" key={w.id} className={"choice" + (whenId === w.id ? " on" : "")} aria-pressed={whenId === w.id}
                onClick={() => setForm((f) => ({ ...f, ...w.set }))}><b>{w.label}</b></button>
            ))}
          </div>

          <h2>3. What is the weather like?</h2>
          <div className="choices three">
            {WEATHERS.map((w) => (
              <button type="button" key={w.id} className={"choice" + (form.weather === w.id ? " on" : "")} aria-pressed={form.weather === w.id}
                onClick={() => set("weather", w.id)}><b>{w.label}</b></button>
            ))}
          </div>
          <p className="hint2">Why weather? In our data, fog adds about 0.09 and rain about 0.06 to the risk score, because they reduce visibility and road grip.</p>

          <details className="more">
            <summary>More road details (optional)</summary>
            <div className="row">{select("road_type")}{select("num_lanes")}</div>
            {select("speed_limit")}
            <div className="field">
              <label htmlFor="curvature">Curvature: <b>{form.curvature.toFixed(2)}</b> (0 straight, 1 very curved)</label>
              <input id="curvature" type="range" min="0" max="1" step="0.01" value={form.curvature}
                onChange={(e) => set("curvature", Number(e.target.value))} />
            </div>
            <div className="checks">{check("road_signs_present", "Road signs present")}{check("public_road", "Public road")}</div>
            <div className="row">
              <div className="field">
                <label htmlFor="acc">Past reported accidents on this road (leave 1 if you are not sure)</label>
                <input id="acc" type="number" min="0" max="10" value={form.num_reported_accidents}
                  onChange={(e) => set("num_reported_accidents", Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />
              </div>
              {select("time_of_day")}
            </div>
            <div className="row">{select("lighting")}{select("weather")}</div>
            <div className="checks">{check("holiday", "Holiday")}{check("school_season", "School season")}</div>
          </details>

          <button type="submit" className="primary" disabled={loading}>{loading ? "Checking..." : "Check my trip"}</button>
          {error && <div className="err" role="alert">{error}</div>}
        </form>

        <section className="card" aria-live="polite">
          {!result ? (
            <p className="empty">Answer the three questions and select Check my trip.</p>
          ) : (
            <div>
              {result.dest && <p className="trip">Trip: {result.dest}</p>}
              <div className="verdict" style={{ color: LEVEL_COLOR[result.level] }}>{VERDICT[result.level]}</div>
              <p className="tip">{TIPS[result.level]}</p>
              <span className="score">{result.risk.toFixed(2)}</span>
              <span className="lvl" style={{ color: LEVEL_COLOR[result.level] }}>{result.level} risk</span>
              <div className="road"><div className="pin" style={{ left: `${Math.min(result.risk, 1) * 100}%` }} /></div>
              <div className="scale"><span>0 safest</span><span>1 riskiest</span></div>
              <h3>Why this score</h3>
              <ul className="drv">
                {result.drivers.length === 0 && <li className="empty">These conditions are close to a typical road.</li>}
                {result.drivers.map((d) => {
                  const w = (Math.abs(d.effect) / maxEffect) * 50;
                  const up = d.effect > 0;
                  return (
                    <li key={d.feature}>
                      <span>{reasonText(d.feature, result.inputs)}</span>
                      <span className="bar"><i style={up ? { left: "50%", width: `${w}%`, background: "#E5484D" } : { right: "50%", width: `${w}%`, background: "#3FB37F" }} /></span>
                      <span>{up ? "+" : ""}{d.effect.toFixed(2)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="note">{result.saved ? "Saved to your history." : "Not saved. Log in below to keep a history of your trips."}</p>
              <p className="note">Bars compare your trip with a typical road (70 km/h, clear weather, daylight, 1 past accident). Red raises the risk, green lowers it. This is an estimate from a model trained on synthetic data, not real safety advice.</p>
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
          <div className="tablewrap"><table>
            <thead><tr><th>Time</th><th>Road</th><th>Risk</th><th>Level</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {history.map((h) => <HistoryRow key={h.id} h={h} api={API} token={token} onChange={loadHistory} />)}
            </tbody>
          </table></div>
        )}
      </section>
      {token && <AccountPanel api={API} token={token} onLogout={logout} />}
      {token && role === "admin" && <AdminPanel api={API} token={token} me={me} />}
    </main>
  );
}

const authHeaders = (t) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });
const errorText = async (r, fallback) => {
  const j = await r.json().catch(() => ({}));
  return typeof j.detail === "string" ? j.detail : fallback;
};

function HistoryRow({ h, api, token, onChange }) {
  const [note, setNote] = useState(h.note || "");
  const [msg, setMsg] = useState("");
  async function save() {
    const r = await fetch(`${api}/history/${h.id}`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ note }) });
    setMsg(r.ok ? "Saved" : "Could not save");
  }
  async function remove() {
    if (!window.confirm("Delete this assessment?")) return;
    const r = await fetch(`${api}/history/${h.id}`, { method: "DELETE", headers: authHeaders(token) });
    if (r.ok) onChange(); else setMsg("Could not delete");
  }
  return (
    <tr>
      <td>{new Date(h.created_at).toLocaleTimeString()}</td>
      <td>{h.inputs.road_type}, {SPEED_KMH[h.inputs.speed_limit]} km/h, {h.inputs.lighting}, {h.inputs.weather}</td>
      <td>{h.risk.toFixed(2)}</td>
      <td style={{ color: LEVEL_COLOR[h.level], fontWeight: 700 }}>{h.level}</td>
      <td className="notecell">
        <input className="notein" aria-label="Note" maxLength={500} placeholder="Add a note" value={note}
          onChange={(e) => { setNote(e.target.value); setMsg(""); }} />
        <button type="button" className="ex" onClick={save}>Save</button>
        {msg && <span className="hint">{msg}</span>}
      </td>
      <td><button type="button" className="ex danger" onClick={remove}>Delete</button></td>
    </tr>
  );
}

function AccountPanel({ api, token, onLogout }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [delPw, setDelPw] = useState("");
  const [delMsg, setDelMsg] = useState("");
  async function changePw(e) {
    e.preventDefault();
    const r = await fetch(`${api}/auth/change-password`, { method: "POST", headers: authHeaders(token),
      body: JSON.stringify({ current_password: cur, new_password: nw }) });
    if (r.ok) { setPwMsg("Password changed."); setCur(""); setNw(""); } else setPwMsg(await errorText(r, "Use 8 to 72 characters."));
  }
  async function deleteAccount(e) {
    e.preventDefault();
    if (!window.confirm("Delete your account and all your assessments? This cannot be undone.")) return;
    const r = await fetch(`${api}/auth/me`, { method: "DELETE", headers: authHeaders(token), body: JSON.stringify({ password: delPw }) });
    if (r.ok) onLogout(); else setDelMsg(await errorText(r, "Could not delete the account."));
  }
  return (
    <details className="card account">
      <summary>Account settings</summary>
      <form onSubmit={changePw}>
        <h2>Change password</h2>
        <div className="row">
          <div className="field"><label htmlFor="cp">Current password</label>
            <input id="cp" type="password" autoComplete="current-password" required minLength={8} maxLength={72} value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="field"><label htmlFor="np">New password (8 to 72 characters)</label>
            <input id="np" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={nw} onChange={(e) => setNw(e.target.value)} /></div>
        </div>
        <button type="submit" className="primary small">Change password</button>
        {pwMsg && <span className="hint"> {pwMsg}</span>}
      </form>
      <form onSubmit={deleteAccount}>
        <h2>Delete my account</h2>
        <div className="field"><label htmlFor="dp">Type your password to confirm</label>
          <input id="dp" type="password" autoComplete="current-password" required minLength={8} maxLength={72} value={delPw} onChange={(e) => setDelPw(e.target.value)} /></div>
        <button type="submit" className="ex danger">Delete my account</button>
        {delMsg && <div className="err" role="alert">{delMsg}</div>}
      </form>
    </details>
  );
}

function AdminPanel({ api, token, me }) {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  async function load() {
    const h = { Authorization: `Bearer ${token}` };
    const [u, a] = await Promise.all([fetch(`${api}/admin/users`, { headers: h }), fetch(`${api}/admin/assessments?limit=20`, { headers: h })]);
    if (u.ok) setUsers(await u.json());
    if (a.ok) setItems(await a.json());
  }
  useEffect(() => { load(); }, [token]);
  async function remove(path, question) {
    if (!window.confirm(question)) return;
    const r = await fetch(`${api}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setMsg(r.ok ? "" : await errorText(r, "Could not delete."));
    load();
  }
  return (
    <section className="card admin">
      <h2>Administration</h2>
      {msg && <div className="err" role="alert">{msg}</div>}
      <h3>Users</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>Email</th><th>Role</th><th>Assessments</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td><td>{u.role}</td><td>{u.assessments}</td>
              <td>{u.email !== me && <button type="button" className="ex danger" onClick={() => remove(`/admin/users/${u.id}`, `Remove ${u.email} and all their assessments?`)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <h3>Latest assessments (all users)</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>Owner</th><th>Road</th><th>Risk</th><th>Level</th><th></th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>{a.owner}</td>
              <td>{a.inputs.road_type}, {SPEED_KMH[a.inputs.speed_limit]} km/h, {a.inputs.lighting}, {a.inputs.weather}</td>
              <td>{a.risk.toFixed(2)}</td>
              <td style={{ color: LEVEL_COLOR[a.level], fontWeight: 700 }}>{a.level}</td>
              <td><button type="button" className="ex danger" onClick={() => remove(`/admin/assessments/${a.id}`, "Delete this assessment?")}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
