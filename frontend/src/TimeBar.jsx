export default function TimeBar({ hour, setHour, playing, setPlaying, start, live }) {
  const zero = live ? 'NOW' : 'PASS'
  const when = start ? new Date(start.getTime() + hour * 3600e3) : null
  return (
    <div className="timebar">
      <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="time-label">
        <b>{hour === 0 ? zero : `+${hour} h`}</b>
        <span>{when ? `${when.toISOString().slice(0, 16).replace('T', ' ')} UTC` : (live ? 'forecast from now' : 'after each satellite pass')}</span>
      </div>
      <input type="range" min={0} max={48} step={3} value={hour}
        onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)) }} />
      <div className="ticks"><span>{live ? 'Now' : 'Satellite pass'}</span><span>+24 h</span><span>+48 h</span></div>
    </div>
  )
}
