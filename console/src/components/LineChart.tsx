/** Single-series line chart: ink line on paper, faint gridlines, mono labels. */
export function LineChart ({
  points, // [x, y] in data coords, sorted by x
  width = 560,
  height = 120,
  yLabel,
  nowX, // highlighted x (e.g. current block)
  formatY = (v: number) => v.toLocaleString('en-US'),
  formatX = (v: number) => v.toLocaleString('en-US')
}: {
  points: [number, number][]
  width?: number
  height?: number
  yLabel?: string
  nowX?: number
  formatY?: (v: number) => string
  formatX?: (v: number) => string
}) {
  const padL = 44
  const padR = 8
  const padT = 8
  const padB = 18
  const w = width - padL - padR
  const h = height - padT - padB
  if (points.length < 2) return null
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const sx = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * w
  const sy = (y: number) => padT + h - ((y - y0) / (y1 - y0 || 1)) * h
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(f => y0 + f * (y1 - y0))
  const nowY = nowX !== undefined && nowX >= x0 && nowX <= x1
    ? points.reduce((acc, p, i) => {
        if (i === 0) return p[1]
        const prev = points[i - 1]
        if (nowX >= prev[0] && nowX <= p[0]) {
          const t = (nowX - prev[0]) / (p[0] - prev[0] || 1)
          return prev[1] + t * (p[1] - prev[1])
        }
        return acc
      }, points[0][1])
    : undefined
  return (
    <svg className="linechart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={yLabel ?? 'chart'}>
      {gridYs.map((y, i) => (
        <g key={i}>
          <line className="grid" x1={padL} x2={width - padR} y1={sy(y)} y2={sy(y)} />
          <text x={padL - 4} y={sy(y) + 3} textAnchor="end">{formatY(y)}</text>
        </g>
      ))}
      <text x={padL} y={height - 4}>{formatX(x0)}</text>
      <text x={width - padR} y={height - 4} textAnchor="end">{formatX(x1)}</text>
      <path className="series" d={path} />
      {nowX !== undefined && nowY !== undefined ? <circle className="now" cx={sx(nowX)} cy={sy(nowY)} r={3.5} /> : null}
    </svg>
  )
}
