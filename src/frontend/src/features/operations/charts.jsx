import React, { useEffect, useRef, useState } from 'react';
import { formatCount, niceTicks } from './format.js';

/* Small, dependency-free chart pieces for the operations dashboard. Text always uses text
 * tokens; colour sits only on marks and legend swatches, and every chart has a text view. */

/** A headline figure with a label and an optional supporting line. */
export function StatTile({ label, value, detail, tone }) {
  return (
    <div className={`ops-tile${tone ? ` ops-tile-${tone}` : ''}`}>
      <div className="ops-tile-label">{tone === 'attention' && <span aria-hidden="true">⚠ </span>}{label}</div>
      <div className="ops-tile-value">{value}</div>
      {detail && <div className="ops-tile-detail">{detail}</div>}
    </div>
  );
}

/**
 * One whole split into parts (tall segmented bar): each part shows its count inside when it
 * fits, the legend names the parts in order, and hover/focus give the name, count and share.
 */
export function SegmentedBar({ label, parts }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <figure className="ops-figure" aria-label={label}>
      {total === 0 ? <div className="ops-empty">None in this period</div> : (
        <div className="ops-segbar" role="list">
          {shown.map((p) => {
            const share = Math.round((p.value / total) * 100);
            const name = `${p.label}: ${formatCount(p.value)} (${share}%)`;
            return (
              <div key={p.key} role="listitem" tabIndex={0} title={name} aria-label={name} className="ops-segment"
                style={{ flexGrow: p.value, backgroundColor: p.color, color: p.ink || '#ffffff' }}>
                {share >= 8 ? formatCount(p.value) : ''}
              </div>
            );
          })}
        </div>
      )}
      <ul className="ops-legend">
        {parts.map((p) => (
          <li key={p.key}><span className="ops-swatch" style={{ backgroundColor: p.color }} aria-hidden="true" />{p.label} <strong>{formatCount(p.value)}</strong></li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * Single-series column chart with a per-column hover/focus tooltip and a table toggle.
 * `points` is [{ key, label, value }]; `everyNthLabel` thins the x-axis labels so they never collide.
 */
export function ColumnChart({ label, points, valueLabel, color = 'var(--color-primary)', everyNthLabel = 1 }) {
  const [active, setActive] = useState(null);
  const [asTable, setAsTable] = useState(false);
  // Draw at the container's real width so text and column widths stay at their pixel sizes.
  const [width, setWidth] = useState(640);
  const container = useRef(null);
  useEffect(() => {
    const node = container.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [asTable]);
  const height = 200, left = 32, bottom = 24, top = 12;
  const { top: max, ticks } = niceTicks(Math.max(0, ...points.map((p) => p.value)));
  const band = (width - left) / Math.max(points.length, 1);
  const barWidth = Math.min(24, band * 0.7);
  // Keep x labels at least 48px apart, so they never collide on narrow screens.
  const labelEvery = Math.max(everyNthLabel, Math.ceil(48 / band));
  const y = (v) => top + (height - top - bottom) * (1 - v / max);
  const current = active === null ? null : points[active];

  return (
    <figure className="ops-figure">
      <div className="ops-figure-head">
        <figcaption className="ops-caption">{label}</figcaption>
        <button type="button" className="ops-link" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show table'}</button>
      </div>
      {asTable ? (
        <table className="ops-table">
          <thead><tr><th scope="col">Period</th><th scope="col">{valueLabel}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.key}><td>{p.label}</td><td>{formatCount(p.value)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="ops-chart" ref={container}>
          <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${label}. Use the table view for exact values.`} onMouseLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--color-border-subtle)" strokeWidth="1" />
                <text x={left - 6} y={y(t) + 4} textAnchor="end" className="ops-axis">{formatCount(t)}</text>
              </g>
            ))}
            {points.map((p, i) => {
              const x = left + band * i + (band - barWidth) / 2, barTop = y(p.value), h = y(0) - barTop;
              const r = Math.min(4, h, barWidth / 2);
              return (
                <g key={p.key}>
                  {p.value > 0 && (
                    <path fill={color} opacity={active === null || active === i ? 1 : 0.55}
                      d={`M${x},${y(0)} V${barTop + r} Q${x},${barTop} ${x + r},${barTop} H${x + barWidth - r} Q${x + barWidth},${barTop} ${x + barWidth},${barTop + r} V${y(0)} Z`} />
                  )}
                  {i % labelEvery === 0 && <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" className="ops-axis">{p.label}</text>}
                  {/* Hit target spans the whole band, larger than the column itself. */}
                  <rect x={left + band * i} y={top} width={band} height={height - top - bottom} fill="transparent" tabIndex={0}
                    aria-label={`${p.label}: ${formatCount(p.value)} ${valueLabel.toLowerCase()}`}
                    onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
                </g>
              );
            })}
          </svg>
          {current && (
            <div className="ops-tooltip" role="status"
              style={{ left: `${((left + band * active + band / 2) / width) * 100}%` }}>
              <strong>{current.label}</strong> · {formatCount(current.value)} {valueLabel.toLowerCase()}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** One row per department: name, an occupancy bar against its own capacity, and the figure. */
export function MeterList({ rows }) {
  if (!rows.length) return <div className="ops-empty">No departments configured</div>;
  return (
    <ul className="ops-meters">
      {rows.map((r) => {
        const share = r.totalBeds ? Math.min(1, r.occupiedBeds / r.totalBeds) : 0;
        const full = r.totalBeds > 0 && r.occupiedBeds >= r.totalBeds, closed = r.status === 'CLOSED';
        return (
          <li key={r.id} className="ops-meter">
            <span className="ops-meter-name">{r.name}{closed && <span className="ops-flag"> · Closed</span>}{full && !closed && <span className="ops-flag"> · ⚠ Full</span>}</span>
            <span className="ops-meter-track" role="meter" aria-valuemin={0} aria-valuemax={r.totalBeds} aria-valuenow={r.occupiedBeds}
              aria-label={`${r.name} beds occupied`}>
              <span className="ops-meter-fill" style={{ width: `${share * 100}%`, backgroundColor: full ? 'var(--color-danger)' : 'var(--color-primary)' }} />
            </span>
            <span className="ops-meter-value">{formatCount(r.occupiedBeds)} / {formatCount(r.totalBeds)} beds</span>
          </li>
        );
      })}
    </ul>
  );
}
