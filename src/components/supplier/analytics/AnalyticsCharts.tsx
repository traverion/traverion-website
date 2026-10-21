import { useId, useMemo, useState } from 'react';
import { formatMoney } from '../../../lib/money';

type SeriesPoint = { key: string; label: string; value: number };

type LineChartProps = {
  points: SeriesPoint[];
  currency?: string;
  valueKind?: 'money' | 'count';
  ariaLabel: string;
  emptyLabel?: string;
  height?: number;
};

function formatAxisValue(value: number, kind: 'money' | 'count', currency?: string): string {
  if (kind === 'count') return String(Math.round(value));
  if (currency) {
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency,
        maximumFractionDigits: value >= 100 ? 0 : 0,
        notation: value >= 10000 ? 'compact' : 'standard',
      }).format(value);
    } catch {
      return Math.round(value).toLocaleString('en-GB');
    }
  }
  return Math.round(value).toLocaleString('en-GB');
}

function formatTooltipValue(value: number, kind: 'money' | 'count', currency?: string): string {
  if (kind === 'count') return String(Math.round(value));
  return currency ? formatMoney(value, currency) : value.toLocaleString('en-GB');
}

/** Nice integer ticks for count charts; avoid duplicate labels when max is small. */
function yTicks(max: number, kind: 'money' | 'count'): number[] {
  if (max <= 0) return [0];
  if (kind === 'count') {
    const ceiling = Math.max(1, Math.ceil(max));
    if (ceiling === 1) return [0, 1];
    if (ceiling === 2) return [0, 1, 2];
    return [0, Math.round(ceiling / 2), ceiling];
  }
  const ceiling = max;
  if (ceiling < 2) return [0, ceiling];
  return [0, ceiling / 2, ceiling];
}

export function AnalyticsLineChart({
  points,
  currency = 'EUR',
  valueKind = 'money',
  ariaLabel,
  emptyLabel = 'No data in this range',
  height = 168,
}: LineChartProps) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { top: 14, right: 14, bottom: 30, left: valueKind === 'money' ? 52 : 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const activePoints = useMemo(() => points.filter((p) => Number.isFinite(p.value)), [points]);
  const hasActivity = activePoints.some((p) => p.value > 0);

  const { max, path, area, xs, ticks } = useMemo(() => {
    const maxVal = Math.max(...activePoints.map((p) => p.value), 0);
    const ceiling =
      valueKind === 'count'
        ? Math.max(1, Math.ceil(maxVal))
        : maxVal > 0
          ? maxVal * 1.12
          : 1;
    const coords = activePoints.map((p, i) => {
      const x =
        activePoints.length <= 1 ? innerW / 2 : (i / (activePoints.length - 1)) * innerW;
      const y = innerH - (p.value / ceiling) * innerH;
      return { x, y, ...p };
    });
    const line =
      coords.length === 1
        ? ''
        : coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath =
      coords.length > 1
        ? `${line} L${coords[coords.length - 1].x.toFixed(1)},${innerH} L${coords[0].x.toFixed(1)},${innerH} Z`
        : '';
    return {
      max: ceiling,
      path: line,
      area: areaPath,
      xs: coords,
      ticks: yTicks(ceiling, valueKind),
    };
  }, [activePoints, innerW, innerH, valueKind]);

  if (activePoints.length === 0 || !hasActivity) {
    return (
      <div className="tv-analytics-chart tv-analytics-chart--empty" role="img" aria-label={ariaLabel}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const active = hover != null ? xs[hover] : null;
  const labelIndexes =
    xs.length <= 6
      ? xs.map((_, i) => i)
      : [0, Math.floor(xs.length / 2), xs.length - 1].filter(
          (v, i, arr) => arr.indexOf(v) === i
        );

  return (
    <div className="tv-analytics-chart" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#073b83" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#073b83" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = pad.top + innerH - (tick / max) * innerH;
          return (
            <g key={`tick-${tick}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#eef0f3" strokeWidth="1" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" className="tv-analytics-chart__axis">
                {formatAxisValue(tick, valueKind, currency)}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${pad.left},${pad.top})`}>
          {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
          {path ? (
            <path d={path} fill="none" stroke="#073b83" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {xs.map((c, i) => (
            <circle
              key={c.key}
              cx={c.x}
              cy={c.y}
              r={xs.length === 1 ? 5 : hover === i ? 4.5 : 3}
              fill="#073b83"
              stroke="#fff"
              strokeWidth="1.5"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              role="listitem"
              aria-label={`${c.label}: ${formatTooltipValue(c.value, valueKind, currency)}`}
            />
          ))}
        </g>
        {labelIndexes.map((i) => {
          const c = xs[i];
          if (!c) return null;
          return (
            <text
              key={`lbl-${c.key}`}
              x={pad.left + c.x}
              y={height - 8}
              textAnchor="middle"
              className="tv-analytics-chart__axis"
            >
              {c.label}
            </text>
          );
        })}
      </svg>
      {active ? (
        <div className="tv-analytics-chart__tooltip" role="status">
          <span className="tv-analytics-chart__tooltip-label">{active.label}</span>
          <span className="tv-analytics-chart__tooltip-value">
            {formatTooltipValue(active.value, valueKind, currency)}
          </span>
        </div>
      ) : xs.length === 1 ? (
        <div className="tv-analytics-chart__tooltip" role="status">
          <span className="tv-analytics-chart__tooltip-label">{xs[0].label}</span>
          <span className="tv-analytics-chart__tooltip-value">
            {formatTooltipValue(xs[0].value, valueKind, currency)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type BarChartProps = {
  bars: { key: string; label: string; value: number; secondary?: string }[];
  ariaLabel: string;
  emptyLabel?: string;
  formatValue?: (value: number) => string;
};

export function AnalyticsBarChart({
  bars,
  ariaLabel,
  emptyLabel = 'No data in this range',
  formatValue = (v) => String(v),
}: BarChartProps) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  if (bars.length === 0 || max === 0) {
    return (
      <div className="tv-analytics-chart tv-analytics-chart--empty" role="img" aria-label={ariaLabel}>
        <p>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="tv-analytics-bars" role="img" aria-label={ariaLabel}>
      <ul>
        {bars.map((bar) => {
          // Exact shared-scale proportion — no artificial minimum that equalizes small counts.
          const width = max > 0 ? (bar.value / max) * 100 : 0;
          return (
            <li key={bar.key}>
              <div className="tv-analytics-bars__meta">
                <span className="tv-analytics-bars__label">{bar.label}</span>
                <span className="tv-analytics-bars__value">
                  {formatValue(bar.value)}
                  {bar.secondary ? (
                    <span className="tv-analytics-bars__secondary"> · {bar.secondary}</span>
                  ) : null}
                </span>
              </div>
              <div className="tv-analytics-bars__track" aria-hidden>
                <div
                  className="tv-analytics-bars__fill"
                  style={{ width: `${width}%`, minWidth: bar.value > 0 ? '2px' : 0 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
