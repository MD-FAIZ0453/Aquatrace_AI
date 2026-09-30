import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CircleMarker, ImageOverlay, LayerGroup, LayersControl, MapContainer, Polygon, Polyline, TileLayer, Tooltip,
  useMap, useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from './api'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
// optional initial view from the URL: ?view=lat,lon,zoom
const VIEW = new URLSearchParams(window.location.search).get('view')?.split(',').map(Number)
const ESRI_ATTR = 'Tiles &copy; Esri, HERE, Garmin, GEBCO, NOAA NGDC, and other contributors'

export const TIER_COLOR = { High: '#f43f5e', Medium: '#f59e0b', Low: '#22c55e' }
const USER_COLOR = '#38bdf8'

function arrows(field, scale, color) {
  // short vector per grid point with a small "V" arrowhead
  return field.map((p, i) => {
    const cos = Math.cos((p.lat * Math.PI) / 180)
    const dLat = p.v * scale
    const dLon = (p.u * scale) / cos
    const end = [p.lat + dLat, p.lon + dLon]
    const ang = Math.atan2(dLat, dLon)
    const len = Math.hypot(dLat, dLon) * 0.35
    const w1 = [end[0] - len * Math.sin(ang - 0.5), end[1] - (len * Math.cos(ang - 0.5)) / cos]
    const w2 = [end[0] - len * Math.sin(ang + 0.5), end[1] - (len * Math.cos(ang + 0.5)) / cos]
    return (
      <Polyline key={i} positions={[[[p.lat, p.lon], end], [w1, end, w2]]}
        pathOptions={{ color, weight: 1.2, opacity: 0.55 }} interactive={false} />
    )
  })
}

function Events({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) })
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 9), { duration: 0.8 })
  }, [target, map])
  return null
}

// The forcing grid is ~1 degree, so vector arrows only make sense at regional zoom levels
function FieldArrows({ field, scale, color }) {
  const [zoom, setZoom] = useState(5)
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  useEffect(() => setZoom(map.getZoom()), [map])
  return zoom <= 7 ? arrows(field, scale, color) : null
}

function Forecast({ fc, color, hour, layers, active, onSelect }) {
  const upto = fc.central_track.filter((p) => p[0] <= hour).map((p) => [p[1], p[2]])
  const full = fc.central_track.map((p) => [p[1], p[2]])
  const frame = fc.frames.reduce((best, f) => (f.h <= hour ? f : best), fc.frames[0])
  const w = active ? 3 : 2
  return (
    <>
      {layers.cones && ['24', '48'].map((h) => fc.horizons[h] && (
        <Polygon key={h} positions={fc.horizons[h].hull} eventHandlers={{ click: onSelect }}
          pathOptions={{
            color, weight: 1, opacity: h === '48' ? 0.6 : 0.9, dashArray: h === '48' ? '4 4' : null,
            fillOpacity: active ? 0.18 : 0.08,
          }}>
          <Tooltip sticky>{fc.id} · +{h} h · spread ±{fc.horizons[h].spread_km} km</Tooltip>
        </Polygon>
      ))}
      <Polyline positions={full} pathOptions={{ color, weight: 1, opacity: 0.35, dashArray: '2 6' }} />
      <Polyline positions={upto} pathOptions={{ color, weight: w, opacity: 0.95 }} />
      {layers.particles && frame.p.map((p, i) => (
        <CircleMarker key={i} center={[p[0], p[1]]} radius={p[2] ? 2.6 : 1.8} interactive={false}
          pathOptions={{ stroke: false, fillColor: p[2] ? '#ffffff' : color, fillOpacity: p[2] ? 0.95 : 0.7 }} />
      ))}
      {fc.beach_points.length > 0 && hour >= (fc.first_beaching_h ?? 99) && fc.beach_points.map((p, i) => (
        <CircleMarker key={`b${i}`} center={p} radius={3} interactive={false}
          pathOptions={{ color: '#fff', weight: 1, fillColor: '#f43f5e', fillOpacity: 0.9 }} />
      ))}
    </>
  )
}

function SourceTrack({ h }) {
  if (!h?.source?.track?.length) return null
  const o = h.source.origin
  return (
    <>
      <Polyline positions={h.source.track} pathOptions={{ color: '#c084fc', weight: 2, opacity: 0.9, dashArray: '6 6' }} />
      <CircleMarker center={o} radius={5} pathOptions={{ color: '#c084fc', weight: 2, fillColor: '#3b0764', fillOpacity: 1 }}>
        <Tooltip><b>Where it was {h.source.hours} h earlier</b><br />{h.source.summary}</Tooltip>
      </CircleMarker>
    </>
  )
}

function RouteLayer({ route }) {
  if (!route?.stops?.length) return null
  const p = [route.port.lat, route.port.lon]
  const path = [p, ...route.stops.map((s) => [s.lat, s.lon]), p]
  return (
    <>
      <Polyline positions={path} pathOptions={{ color: '#4ade80', weight: 3, opacity: 0.95 }} />
      <CircleMarker center={p} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }}>
        <Tooltip permanent direction="left"><b>⚓ {route.port.name}</b></Tooltip>
      </CircleMarker>
      {route.stops.map((s, i) => (
        <Fragment key={s.id}>
          <Polyline positions={[s.seen_at, [s.lat, s.lon]]} pathOptions={{ color: '#4ade80', weight: 1, dashArray: '2 4' }} />
          <CircleMarker center={[s.lat, s.lon]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#15803d', fillOpacity: 1 }}>
            <Tooltip permanent direction="right"><b>{i + 1}</b> {s.id} · +{s.arrive_h} h</Tooltip>
          </CircleMarker>
        </Fragment>
      ))}
    </>
  )
}

export default function MapView({ run, runId, hour, layers, selected, setSelected, forecastById, whatIf, onMapClick, whatIfMode, route }) {
  const target = useMemo(() => {
    if (selected === 'USER' && whatIf) return [whatIf.lat, whatIf.lon]
    const h = run?.hotspots.find((x) => x.id === selected)
    return h ? [h.lat, h.lon] : null
  }, [selected, run, whatIf])

  return (
    <div className={`map ${whatIfMode ? 'crosshair' : ''}`}>
      <MapContainer center={VIEW ? [VIEW[0], VIEW[1]] : [15.5, 87.5]} zoom={VIEW ? VIEW[2] : 5} minZoom={4} maxZoom={14}
        preferCanvas zoomControl={false}
        style={{ height: '100%', width: '100%' }}>
        <LayersControl position="topleft">
          <LayersControl.BaseLayer checked name="Dark">
            <LayerGroup>
              <TileLayer url={`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ESRI_ATTR} maxNativeZoom={16} />
              <TileLayer url={`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} maxNativeZoom={16} />
            </LayerGroup>
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`} attribution={ESRI_ATTR} maxNativeZoom={17} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Ocean">
            <TileLayer url={`${ESRI}/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`} attribution={ESRI_ATTR} maxNativeZoom={13} />
          </LayersControl.BaseLayer>
        </LayersControl>
        <Events onClick={onMapClick} />
        <FlyTo target={target} />

        {run && layers.truecolor && run.overlays.map((o) => (
          <ImageOverlay key={`t${o.truecolor}`} url={api.file(runId, o.truecolor)} bounds={o.bounds} opacity={0.9} />
        ))}
        {run && layers.anomaly && run.overlays.map((o) => (
          <ImageOverlay key={`a${o.anomaly}`} url={api.file(runId, o.anomaly)} bounds={o.bounds} opacity={0.95} />
        ))}
        {run && layers.currents && <FieldArrows field={run.fields.currents} scale={1.2} color='#67e8f9' />}
        {run && layers.wind && <FieldArrows field={run.fields.wind} scale={0.08} color='#c4b5fd' />}

        {run && layers.sites && run.sites.map((s) => (
          <CircleMarker key={s.name} center={[s.lat, s.lon]} radius={5}
            pathOptions={{ color: '#fde68a', weight: 1.5, fillColor: '#0b1623', fillOpacity: 1 }}>
            <Tooltip><b>{s.name}</b><br />{s.type}</Tooltip>
          </CircleMarker>
        ))}

        {run && run.hotspots.map((h) => {
          const fc = forecastById[h.id]
          const color = TIER_COLOR[h.risk.tier]
          const active = selected === h.id
          return (
            <Fragment key={h.id}>
              {fc && <Forecast fc={fc} color={color} hour={hour} layers={layers} active={active}
                onSelect={() => setSelected(h.id)} />}
              {h.detected && h.nowcast?.track?.length > 0 && (
                <>
                  <Polyline positions={h.nowcast.track}
                    pathOptions={{ color: '#cbd5e1', weight: 1.5, opacity: 0.8, dashArray: '3 5' }} />
                  <CircleMarker center={[h.detected.lat, h.detected.lon]} radius={6}
                    pathOptions={{ color: '#cbd5e1', weight: 1.5, fillOpacity: 0 }}>
                    <Tooltip>Satellite detection · {h.detected.time.replace('T', ' ').slice(0, 16)} UTC<br />
                      drifted {h.nowcast.age_h} h to its estimated position now</Tooltip>
                  </CircleMarker>
                </>
              )}
              <CircleMarker center={[h.lat, h.lon]} radius={active ? 9 : 5 + h.risk.risk_score / 20}
                eventHandlers={{ click: () => setSelected(h.id) }}
                pathOptions={{ color: '#fff', weight: active ? 2.5 : 1, fillColor: color, fillOpacity: 0.95 }}>
                <Tooltip>
                  <b>#{h.rank} {h.id}</b> · {h.risk.tier} priority ({h.risk.risk_score})<br />
                  confidence {(h.confidence * 100).toFixed(0)}% · {h.region || h.sensor}
                </Tooltip>
              </CircleMarker>
            </Fragment>
          )
        })}

        {run && <SourceTrack h={run.hotspots.find((x) => x.id === selected)} />}
        <RouteLayer route={route} />

        {whatIf && (
          <>
            <Forecast fc={whatIf.forecast} color={USER_COLOR} hour={hour} layers={layers}
              active={selected === 'USER'} onSelect={() => setSelected('USER')} />
            <CircleMarker center={[whatIf.lat, whatIf.lon]} radius={8}
              pathOptions={{ color: '#fff', weight: 2, fillColor: USER_COLOR, fillOpacity: 1 }}>
              <Tooltip permanent direction="top">What-if release</Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>
      <div className="legend">
        <div><i style={{ background: TIER_COLOR.High }} />High</div>
        <div><i style={{ background: TIER_COLOR.Medium }} />Medium</div>
        <div><i style={{ background: TIER_COLOR.Low }} />Low priority</div>
        <div><i className="ring" />Sensitive site</div>
        <div><i className="beach" />Predicted beaching</div>
        <div><span className="line solid" />Track so far · <span className="line dash" />48 h cone</div>
        {run?.live && <div><i className="ring grey" />Seen by satellite → now</div>}
        <div><span className="line dash purple" />Back-track: where it came from</div>
        {route && <div><span className="line solid green" />Cleanup vessel route</div>}
      </div>
    </div>
  )
}
