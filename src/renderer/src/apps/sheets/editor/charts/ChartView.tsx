import { formatGeneralNumber } from '../../model/format'
import { niceTicks, type ChartData } from '../../model/chart'
import type { ChartKind } from '../../model/types'

/** Colores de las series: el verde de Hojas primero y luego tonos que se distinguen entre sí. */
export const SERIES_COLORS = ['#1f7a4d', '#2f6fb3', '#d08a1c', '#b3392f', '#7b4fa8', '#3a9a9a', '#8a8a3a']

interface ChartViewProps {
  kind: ChartKind
  data: ChartData
  title?: string
  width: number
  height: number
}

/**
 * Gráfico en SVG propio: barras, líneas o circular. Sin librería a propósito: un gráfico de
 * oficina sencillo son rectángulos, polilíneas y arcos, y así no añadimos cientos de KB al
 * paquete. Lo que dibuja depende solo de sus props (es puro), así que se actualiza solo al recalcular.
 */
export function ChartView({ kind, data, title, width, height }: ChartViewProps) {
  const titleHeight = title ? 28 : 8
  const legendHeight = kind === 'pie' || data.series.length > 1 ? 22 : 0
  const plot = { x: 0, y: titleHeight, width, height: height - titleHeight - legendHeight }

  const hasData = data.series.some((series) => series.values.some((value) => value !== null))
  return (
    <svg
      className="sheet-chart__svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title ? `Gráfico: ${title}` : 'Gráfico'}
    >
      <rect width={width} height={height} fill="#fff" />
      {title && (
        <text x={width / 2} y={19} textAnchor="middle" className="sheet-chart__title">
          {title}
        </text>
      )}
      {!hasData ? (
        <text x={width / 2} y={height / 2} textAnchor="middle" className="sheet-chart__empty">
          No hay números en el rango
        </text>
      ) : kind === 'pie' ? (
        <PieChart data={data} {...plot} />
      ) : (
        <CartesianChart kind={kind} data={data} {...plot} />
      )}
      {legendHeight > 0 && hasData && <Legend data={data} pie={kind === 'pie'} y={height - 14} width={width} />}
    </svg>
  )
}

interface PlotProps {
  data: ChartData
  x: number
  y: number
  width: number
  height: number
}

function CartesianChart({ kind, data, x, y, width, height }: PlotProps & { kind: 'bar' | 'line' }) {
  const values = data.series.flatMap((series) => series.values).filter((value): value is number => value !== null)
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const low = ticks[0]
  const high = ticks[ticks.length - 1]
  const left = x + 46
  const right = x + width - 12
  const top = y + 6
  const bottom = y + height - 22
  const scaleY = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top)
  const band = (right - left) / Math.max(1, data.categories.length)
  // Como mucho una etiqueta cada ~40 px para que no se pisen.
  const labelEvery = Math.max(1, Math.ceil(40 / band))

  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={right} y1={scaleY(tick)} y2={scaleY(tick)} className="sheet-chart__grid" />
          <text x={left - 6} y={scaleY(tick) + 4} textAnchor="end" className="sheet-chart__axis">
            {formatGeneralNumber(tick)}
          </text>
        </g>
      ))}
      <line x1={left} x2={right} y1={scaleY(0)} y2={scaleY(0)} className="sheet-chart__baseline" />
      {data.categories.map((category, index) =>
        index % labelEvery === 0 ? (
          <text
            key={index}
            x={left + band * (index + 0.5)}
            y={bottom + 15}
            textAnchor="middle"
            className="sheet-chart__axis"
          >
            {category.length > 12 ? `${category.slice(0, 11)}…` : category}
          </text>
        ) : null
      )}
      {kind === 'bar'
        ? data.series.map((series, seriesIndex) => {
            const groupWidth = band * 0.7
            const barWidth = groupWidth / data.series.length
            return series.values.map((value, index) => {
              if (value === null) return null
              const barX = left + band * index + (band - groupWidth) / 2 + barWidth * seriesIndex
              const barTop = Math.min(scaleY(value), scaleY(0))
              return (
                <rect
                  key={`${seriesIndex}-${index}`}
                  x={barX}
                  y={barTop}
                  width={Math.max(1, barWidth - 1)}
                  height={Math.abs(scaleY(value) - scaleY(0))}
                  fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                >
                  <title>{`${series.name} · ${data.categories[index]}: ${formatGeneralNumber(value)}`}</title>
                </rect>
              )
            })
          })
        : data.series.map((series, seriesIndex) => {
            const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]
            // Un hueco (celda vacía o texto) corta la línea, como en Excel por defecto.
            const segments: string[] = []
            let current = ''
            series.values.forEach((value, index) => {
              if (value === null) {
                if (current) segments.push(current)
                current = ''
                return
              }
              current += `${current ? 'L' : 'M'}${left + band * (index + 0.5)},${scaleY(value)}`
            })
            if (current) segments.push(current)
            return (
              <g key={seriesIndex}>
                {segments.map((path, index) => (
                  <path key={index} d={path} fill="none" stroke={color} strokeWidth={2} />
                ))}
                {series.values.map((value, index) =>
                  value === null ? null : (
                    <circle key={index} cx={left + band * (index + 0.5)} cy={scaleY(value)} r={3} fill={color}>
                      <title>{`${series.name} · ${data.categories[index]}: ${formatGeneralNumber(value)}`}</title>
                    </circle>
                  )
                )}
              </g>
            )
          })}
    </g>
  )
}

/** Circular: la primera serie; los negativos y vacíos no tienen sector (Excel hace lo mismo). */
function PieChart({ data, x, y, width, height }: PlotProps) {
  const values = data.series[0].values.map((value) => (value !== null && value > 0 ? value : 0))
  const total = values.reduce((sum, value) => sum + value, 0)
  const radius = Math.max(10, Math.min(width, height) / 2 - 10)
  const cx = x + width / 2
  const cy = y + height / 2
  if (total === 0) return null
  let angle = -Math.PI / 2
  return (
    <g>
      {values.map((value, index) => {
        if (value === 0) return null
        const sweep = (value / total) * Math.PI * 2
        const start = angle
        angle += sweep
        const color = SERIES_COLORS[index % SERIES_COLORS.length]
        const label = `${data.categories[index]}: ${formatGeneralNumber(value)} (${Math.round((value / total) * 100)} %)`
        if (sweep >= Math.PI * 2 - 1e-9) {
          return (
            <circle key={index} cx={cx} cy={cy} r={radius} fill={color}>
              <title>{label}</title>
            </circle>
          )
        }
        const point = (theta: number) => `${cx + radius * Math.cos(theta)},${cy + radius * Math.sin(theta)}`
        const largeArc = sweep > Math.PI ? 1 : 0
        return (
          <path
            key={index}
            d={`M${cx},${cy} L${point(start)} A${radius},${radius} 0 ${largeArc} 1 ${point(angle)} Z`}
            fill={color}
            stroke="#fff"
            strokeWidth={1}
          >
            <title>{label}</title>
          </path>
        )
      })}
    </g>
  )
}

function Legend({ data, pie, y, width }: { data: ChartData; pie: boolean; y: number; width: number }) {
  const labels = pie ? data.categories : data.series.map((series) => series.name)
  const itemWidth = Math.min(120, width / Math.max(1, labels.length))
  const startX = (width - itemWidth * labels.length) / 2
  return (
    <g>
      {labels.map((label, index) => (
        <g key={index} transform={`translate(${startX + itemWidth * index}, ${y})`}>
          <rect y={-8} width={10} height={10} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
          <text x={14} y={1} className="sheet-chart__legend">
            {label.length > 14 ? `${label.slice(0, 13)}…` : label}
          </text>
        </g>
      ))}
    </g>
  )
}
