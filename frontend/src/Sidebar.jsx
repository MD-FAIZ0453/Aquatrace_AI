import { useEffect, useState } from 'react'
import { api } from './api'
import { TIER_COLOR } from './MapView'

function RoutePlanner({ runId, route, setRoute, setError }) {
  const [ports, setPorts] = useState([])
  const [port, setPort] = useState('Chennai')
  const [speed, setSpeed] = useState(10)
  const [stops, setStops] = useState(4)
  const [loading, setLoading] = useState(false)
  useEffect(() => { api.ports().then(setPorts).catch(() => {}) }, [])
  useEffect(() => { if (route) setPort(route.port.name) }, [route])
  async function go() {
    setLoading(true)
    try {
      const r = await api.route(runId, { port, speed_kn: speed, max_stops: stops, include_low: true })
      setRoute(r)
      if (!r.stops.length) setError(`No reachable hotspots within 450 km of ${port}`)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  return (
    <div className="planner">
      <div className="planner-row">
        <select value={port} onChange={(e) => setPort(e.target.value)}>
          {ports.map((p) => <option key={p.name}>{p.name}</option>)}
        </select>
        <label>kn <input type="number" min={5} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
        <label>stops <input type="number" min={1} max={10} value={stops} onChange={(e) => setStops(Number(e.target.value))} /></label>
      </div>
      <button className="plan-btn" onClick={go} disabled={loading || !runId}>{loading ? 'Planning…' : '⚓ Plan cleanup route'}</button>
      {route && (
        <div className="route-summary">
          <b>{route.stops.length} stops · {route.total_km} km · {route.total_h} h</b> from {route.port.name}
          <ol>
            {route.stops.map((s) => (
              <li key={s.id}>{s.id} ({s.tier}) · arrive +{s.arrive_h} h · it drifts {s.drift_since_seen_km} km before we reach it</li>
            ))}
          </ol>
          <button className="link" onClick={() => setRoute(null)}>Clear route</button>
        </div>
      )}
    </div>
  )
}

const LAYERS = [
  ['truecolor', 'Satellite true colour'],
  ['anomaly', 'Debris anomaly (FDI z-score)'],
  ['currents', 'Surface currents'],
  ['wind', '10 m wind'],
  ['sites', 'Sensitive coastal sites'],
  ['cones', '24 h / 48 h uncertainty cones'],
  ['particles', 'Particle ensemble'],
]

const COMPONENTS = [
  ['confidence', 'Hotspot confidence', 35],
  ['proximity', 'Proximity to sensitive coast', 25],
  ['beaching', 'Beaching likelihood', 15],
  ['persistence', 'Persistence / recurrence', 15],
  ['certainty', 'Forecast certainty', 10],
]

function short(src) {
  if (!src) return '—'
  return src.split(',')[0].split('[')[0].trim()
}

function Reliability({ cal }) {
  if (!cal) return null
  const W = 150, H = 150, pad = 18
  const x = (v) => pad + v * (W - 2 * pad)
  const y = (v) => H - pad - v * (H - 2 * pad)
  const pts = cal.curve.filter((c) => c.n >= 20)
  return (
    <div className="reliability">
      <svg width={W} height={H} role="img" aria-label="Reliability diagram">
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="none" stroke="var(--line)" />
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--muted)" strokeDasharray="3 3" />
        <polyline fill="none" stroke="var(--accent)" strokeWidth="2"
          points={pts.map((c) => `${x(c.confidence)},${y(c.observed)}`).join(' ')} />
        {pts.map((c, i) => <circle key={i} cx={x(c.confidence)} cy={y(c.observed)} r="3" fill="var(--accent)" />)}
        <text x={W / 2} y={H - 3} fontSize="9" fill="var(--muted)" textAnchor="middle">stated confidence</text>
        <text x={6} y={H / 2} fontSize="9" fill="var(--muted)" textAnchor="middle" transform={`rotate(-90 6 ${H / 2})`}>observed</text>
      </svg>
      <div className="rel-text">
        <b>ECE {(cal.ece * 100).toFixed(1)}%</b>
        <span>Average gap between how sure the model says it is and how often it is right (floating material, MARIDA test set). Dashed line = perfect.</span>
      </div>
    </div>
  )
}

function Kpi({ value, label, accent }) {
  return (
    <div className="kpi">
      <div className="kpi-value" style={accent ? { color: accent } : null}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  )
}

function Detail({ h, fc, risk, title }) {
  return (
    <div className="detail">
      <div className="detail-head">
        <b>{title}</b>
        <span className="chip" style={{ background: TIER_COLOR[risk.tier] }}>{risk.tier} · {risk.risk_score}</span>
      </div>
      <p className="action">{risk.action}</p>
      <div className="bars">
        {COMPONENTS.map(([k, label, w]) => (
          <div key={k} className="bar-row">
            <span>{label} <em>({w}%)</em></span>
            <div className="bar"><div style={{ width: `${Math.round(risk.components[k] * 100)}%` }} /></div>
          </div>
        ))}
      </div>
      <table className="facts">
        <tbody>
          {h.detected && <tr><td>Satellite saw it</td><td>{h.detected.time.replace('T', ' ').slice(0, 16)} UTC at {h.detected.lat.toFixed(2)}°N {h.detected.lon.toFixed(2)}°E</td></tr>}
          <tr><td>{h.detected ? 'Estimated now' : 'Position'}</td><td>{h.lat.toFixed(3)}°N {h.lon.toFixed(3)}°E{h.nowcast ? ` (drifted ${h.nowcast.age_h} h)` : ''}</td></tr>
          {h.max_z != null && <tr><td>FDI anomaly</td><td>z = {h.max_z} · {h.pixels} px ({h.area_km2} km²)</td></tr>}
          {h.p_floating_ml != null && <tr><td>ML P(floating)</td><td>{(h.p_floating_ml * 100).toFixed(0)}% (MARIDA model)</td></tr>}
          <tr><td>+24 h drift</td><td>{fc.horizons['24'].displacement_km} km · spread ±{fc.horizons['24'].spread_km} km</td></tr>
          <tr><td>+48 h drift</td><td>{fc.horizons['48'].displacement_km} km · spread ±{fc.horizons['48'].spread_km} km</td></tr>
          <tr><td>Beaching</td><td>{(fc.beached_fraction * 100).toFixed(0)}%{fc.first_beaching_h != null ? ` · first at +${fc.first_beaching_h} h` : ''}</td></tr>
          <tr><td>Nearest site</td><td>{risk.nearest_site}{risk.min_distance_to_site_km != null ? ` (${risk.min_distance_to_site_km} km)` : ''}</td></tr>
          {h.source && <tr><td>Likely source</td><td>{h.source.summary}</td></tr>}
          <tr><td>Coast distance</td><td>{risk.min_distance_to_coast_km} km (closest along track)</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export default function Sidebar({
  runs, runId, setRunId, run, metrics, selected, setSelected, forecastById, layers, setLayers,
  whatIfMode, setWhatIfMode, whatIf, busy, route, setRoute, setError,
}) {
  const hs = run?.hotspots || []
  const high = hs.filter((h) => h.risk.tier === 'High').length
  const drift48 = hs.length
    ? (hs.reduce((s, h) => s + forecastById[h.id].horizons['48'].displacement_km, 0) / hs.length).toFixed(0)
    : '—'
  const det = metrics?.detection
  const val = metrics?.drift
  const sel = hs.find((h) => h.id === selected)

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">≈</div>
        <div>
          <h1>AquaTrace AI</h1>
          <p>From detecting debris to predicting its next move</p>
        </div>
      </div>

      <label className="field">
        <span>Forecast run</span>
        <select value={runId || ''} onChange={(e) => setRunId(e.target.value)}>
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.run_id.startsWith('live_') ? `LIVE ${r.run_id.slice(5, 9)}-${r.run_id.slice(9, 11)}-${r.run_id.slice(11, 13)} ${r.run_id.slice(14, 16)}:00 UTC` : `${r.date} replay`} · {r.hotspots} hotspots
            </option>
          ))}
        </select>
      </label>

      {run && (
        <div className="sources">
          <div><span>Observe</span>{short(run.sources.detection)}</div>
          <div><span>Currents</span>{short(run.sources.currents.source)}</div>
          <div><span>Wind</span>{short(run.sources.wind.source)}</div>
          <div><span>AI model</span>{run.sources.ml_model || 'Spectral anomaly (FDI)'}</div>
        </div>
      )}

      <div className="kpis">
        <Kpi value={hs.length || '—'} label="Hotspots" />
        <Kpi value={high} label="High priority" accent={TIER_COLOR.High} />
        <Kpi value={`${drift48} km`} label="Mean 48 h drift" />
        <Kpi value={det ? det.debris.f1.toFixed(2) : '—'} label="Debris F1 (MARIDA)" />
        <Kpi value={val ? `${val.summary['24'].median_km.toFixed(0)} km` : '—'} label="24 h error (buoys)" />
        <Kpi value={val ? `${val.summary['48'].median_km.toFixed(0)} km` : '—'} label="48 h error (buoys)" />
      </div>

      <button className={`whatif ${whatIfMode ? 'on' : ''}`} onClick={() => setWhatIfMode(!whatIfMode)}>
        {busy ? 'Forecasting…' : whatIfMode ? '✕ Exit what-if mode' : '⊕ What-if: click the sea to forecast'}
      </button>

      {selected === 'USER' && whatIf && (
        <Detail title="What-if release" h={{ lat: whatIf.lat, lon: whatIf.lon }} fc={whatIf.forecast} risk={whatIf.risk} />
      )}
      {sel && <Detail title={`#${sel.rank} ${sel.id}${sel.region ? ` · ${sel.region}` : ''}`} h={sel} fc={forecastById[sel.id]} risk={sel.risk} />}

      <h2>Plan cleanup route</h2>
      <RoutePlanner runId={runId} route={route} setRoute={setRoute} setError={setError} />

      <h2>Cleanup priority</h2>
      {!run && <p className="muted">Loading run…</p>}
      <ol className="list">
        {hs.map((h) => {
          const fc = forecastById[h.id]
          return (
            <li key={h.id} className={selected === h.id ? 'active' : ''} onClick={() => setSelected(h.id)}>
              <span className="rank" style={{ background: TIER_COLOR[h.risk.tier] }}>{h.rank}</span>
              <div className="li-body">
                <div className="li-top"><b>{h.id}</b><span>{h.risk.risk_score}</span></div>
                <div className="li-sub">
                  {h.nowcast ? `seen ${h.nowcast.age_h} h ago · ` : ''}{h.risk.nearest_site} · {fc.horizons['48'].displacement_km} km/48 h · conf {(h.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <h2>Model trust</h2>
      <Reliability cal={metrics?.calibration?.floating_material} />
      {det && <p className="muted">{det.model}. Accuracy {(det.accuracy * 100).toFixed(1)}% · macro F1 {det.macro_f1} on {det.test_pixels.toLocaleString()} unseen test pixels.</p>}

      <h2>Layers</h2>
      <div className="layers">
        {LAYERS.map(([k, label]) => (
          <label key={k}>
            <input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} />
            {label}
          </label>
        ))}
      </div>
      <p className="foot">
        Detections are <i>potential</i> floating-material hotspots with a confidence score; field validation is
        needed before treating them as confirmed litter.
      </p>
    </aside>
  )
}
