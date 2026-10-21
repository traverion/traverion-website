import { useId, useMemo, useState } from 'react';
import { formatMoney } from '../../../lib/money';

type SeriesPoint = { key: string; label: string; value: number };

type LineChartProps = {
  points: SeriesPoint[];
  currency: string;
  ariaLabel: string;
  emptyLabel?: string;
  height?: number;
};

export function AnalyticsLineChart({
  points,
  currency,
  ariaLabel,
  emptyLabel = 'No data in this range',
  height = 180,
}: LineChartProps) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { top: 12, right: 12, bottom: 28, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const { max, path, area, xs } = useMemo(() => {
    const maxVal = Math.max(...points.map((p) => p.value), 0);
    const ceiling = maxVal > 0 ? maxVal * 1.08 : 1;
    const coords = points.map((p, i) => {
      const x = points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW;
      const y = innerH - (p.value / ceiling) * innerH;
      return { x, y, ...p };
    });
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath =
      coords.length > 0
        ? `${line} L${coords[coords.length - 1].x.toFixed(1)},${innerH} L${coords[0].x.toFixed(1)},${innerH} Z`
        : '';
    return { max: ceiling, path: line, area: areaPath, xs: coords };
  }, [points, innerW, innerH]);

  if (points.length === 0) {
    return (
      <div
        className="tv-analytics-chart tv-analytics-chart--empty"
        role="img"
        aria-label={ariaLabel}
      >
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const active = hover != null ? xs[hover] : null;

  return (
    <div className="tv-analytics-chart" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#073b83" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#073b83" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = pad.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" className="tv-analytics-chart__axis">
                {t === 0 ? '0' : Math.round(max * t).toLocaleString('en-GB')}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${pad.left},${pad.top})`}>
          <path d={area} fill={`url(#${gradId})`} />
          <path d={path} fill="none" stroke="#073b83" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {xs.map((c, i) => (
            <circle
              key={c.key}
              cx={c.x}
              cy={c.y}
              r={hover === i ? 4 : 2.5}
              fill="#073b83"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              role="listitem"
              aria-label={`${c.label}: ${formatMoney(c.value, currency)}`}
            />
          ))}
        </g>
        {xs.filter((_, i) => i === 0 || i === xs.length - 1 || i === Math.floor(xs.length / 2)).map((c) => (
          <text
            key={`lbl-${c.key}`}
            x={pad.left + c.x}
            y={height - 8}
            textAnchor="middle"
            className="tv-analytics-chart__axis"
          >
            {c.label}
          </text>
        ))}
      </svg>
      {active ? (
        <p className="tv-analytics-chart__tip" role="status">
          {active.label}: {formatMoney(active.value, currency)}
        </p>
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
          const width = max > 0 ? Math.max(4, (bar.value / max) * 100) : 0;
          return (
            <li key={bar.key}>
              <div className="tv-analytics-bars__meta">
                <span className="tv-analytics-bars__label">{bar.label}</span>
                <span className="tv-analytics-bars__value">
                  {formatValue(bar.value)}
                  {bar.secondary ? <span className="tv-analytics-bars__secondary"> · {bar.secondary}</span> : null}
                </span>
              </div>
              <div className="tv-analytics-bars__track" aria-hidden>
                <div className="tv-analytics-bars__fill" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
