'use client';
import React from 'react';
import { dimensionGeometry, type DrawingEntity } from '@/engine/cad';

/** Engineering Y-up annotation; text is locally flipped back for legibility. */
export default function CadDimension({
  entity,
  px,
  color,
}: {
  entity: DrawingEntity;
  px: number;
  color: string;
}) {
  const geometry = dimensionGeometry(entity, px * 4);
  let angle = geometry.angle;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return (
    <g data-testid="cad-dimension" data-measurement={geometry.measurement}>
      {geometry.segments.map(([a, b], index) => (
        <line
          key={index}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={px * 1.2}
        />
      ))}
      <g transform={`translate(${geometry.text.x},${geometry.text.y}) rotate(${angle})`}>
        <text
          transform="scale(1,-1)"
          y={-px * 6}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize={px * 12}
          fill={color}
        >
          {geometry.label}
        </text>
      </g>
      {geometry.segments.slice(0, 3).map(([a, b], index) => (
        <line
          key={`hit-${index}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="transparent"
          strokeWidth={px * 10}
        />
      ))}
    </g>
  );
}
