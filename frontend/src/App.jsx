import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import MapView from './MapView'
import Sidebar from './Sidebar'
import TimeBar from './TimeBar'

const STAGES = ['Observe', 'Detect', 'Fuse', 'Forecast', 'Prioritize']

export default function App() {
  const [runs, setRuns] = useState([])
  const [runId, setRunId] = useState(null)
  const [run, setRun] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(null)
  const [layers, setLayers] = useState({
    truecolor: true, anomaly: true, currents: true, wind: false, sites: true, cones: true, particles: true,
  })
  const [whatIfMode, setWhatIfMode] = useState(false)
  const [whatIf, setWhatIf] = useState(null)
  const [busy, setBusy] = useState(false)
  const [route, setRoute] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.runs()
      .then((r) => {
        setRuns(r)
        const want = new URLSearchParams(window.location.search).get('run')
        if (r.length) setRunId(r.find((x) => x.run_id === want)?.run_id || r[0].run_id)
      })
      .catch((e) => setError(`Cannot reach the API: ${e.message}`))
    api.metrics().then(setMetrics).catch(() => {})
  }, [])

  useEffect(() => {
    if (!runId) return
    setRun(null); setSelected(null); setWhatIf(null); setHour(0); setRoute(null)
    api.run(runId).then(setRun).catch((e) => setError(e.message))
  }, [runId])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setHour((h) => (h >= 48 ? 0 : h + 3)), 650)
    return () => clearInterval(t)
  }, [playing])

  // Shareable views, e.g. ?run=20260314_pace&select=HS-07&hour=24&route=Port%20Blair&stops=4
  const applied = useRef(false)
  useEffect(() => {
    if (!run || applied.current) return
    applied.current = true
    const q = new URLSearchParams(window.location.search)
    if (q.get('select')) setSelected(q.get('select'))
    if (q.get('hour')) setHour(Number(q.get('hour')))
    if (q.get('hide')) setLayers((l) => ({ ...l, ...Object.fromEntries(q.get('hide').split(',').map((k) => [k, false])) }))
    if (q.get('route')) {
      api.route(run.run_id, { port: q.get('route'), max_stops: q.get('stops') || 4, include_low: true })
        .then(setRoute).catch(() => {})
    }
  }, [run])

  const forecastById = useMemo(() => {
    const m = {}
    run?.forecasts.forEach((f) => { m[f.id] = f })
    if (whatIf) m.USER = whatIf.forecast
    return m
  }, [run, whatIf])

  // Hindcast hotspots come from passes on different days, so the clock follows the selected
  // forecast; a live run starts every forecast at the same "now".
  const startTime = useMemo(() => {
    const fc = selected && forecastById[selected]
    if (fc) return new Date(Date.parse(fc.start + 'Z'))
    if (run?.live) return new Date(Date.parse(run.issued + 'Z'))
    return null
  }, [run, selected, forecastById])

  // Pick up a newer live run automatically (the pipeline can be scheduled to run after each pass)
  useEffect(() => {
    const t = setInterval(() => {
      api.runs().then((r) => {
        setRuns(r)
        if (run?.live && r.length && r[0].run_id !== runId && r[0].run_id.startsWith('live_')) setRunId(r[0].run_id)
      }).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [run, runId])

  const hoursAgo = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso + 'Z')) / 3600e3))

  async function onMapClick(lat, lon) {
    if (!whatIfMode || !runId) return
    setBusy(true); setError(null)
    try {
      const r = await api.forecast({ lat, lon, run_id: runId })
      setWhatIf({ ...r, lat, lon })
      setSelected('USER')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <Sidebar
        runs={runs} runId={runId} setRunId={setRunId} run={run} metrics={metrics}
        selected={selected} setSelected={setSelected} forecastById={forecastById}
        layers={layers} setLayers={setLayers}
        whatIfMode={whatIfMode} setWhatIfMode={setWhatIfMode} whatIf={whatIf} busy={busy}
        route={route} setRoute={setRoute} setError={setError}
      />
      <main className="main">
        <header className="pipeline">
          {run?.live && (
            <span className="live"><i />LIVE · issued {run.issued.slice(11, 16)} UTC
              {run.latest_pass && ` · latest pass ${hoursAgo(run.latest_pass)} h ago`}</span>
          )}
          {STAGES.map((s, i) => (
            <span key={s} className="stage"><b>{String(i + 1).padStart(2, '0')}</b> {s}</span>
          ))}
          <span className="tagline">See the problem. Predict its next move. Act first.</span>
        </header>
        {error && <div className="error" onClick={() => setError(null)}>{error}</div>}
        {whatIfMode && <div className="hint">What-if mode: click anywhere on the sea to forecast a debris patch released there.</div>}
        <MapView
          run={run} runId={runId} hour={hour} layers={layers} selected={selected} setSelected={setSelected}
          forecastById={forecastById} whatIf={whatIf} onMapClick={onMapClick} whatIfMode={whatIfMode}
          route={route}
        />
        <TimeBar hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} start={startTime} live={!!run?.live} />
      </main>
    </div>
  )
}
