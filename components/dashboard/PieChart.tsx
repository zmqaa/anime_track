"use client";

import { useMemo, useState } from 'react';

interface PieChartItem {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartItem[];
  size?: number;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function PieChart({ data, size = 128 }: PieChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;

  const segments = useMemo(() => {
    const positive = data.filter((item) => item.value > 0);
    const total = positive.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) return [];

    let startAngle = -Math.PI / 2;
    return positive.map((item) => {
      const angle = (item.value / total) * Math.PI * 2;
      const endAngle = startAngle + angle;

      const start = polarToCartesian(cx, cy, radius, startAngle);
      const end = polarToCartesian(cx, cy, radius, endAngle);
      const largeArcFlag = angle > Math.PI ? 1 : 0;
      const d = [
        `M ${cx} ${cy}`,
        `L ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
        'Z',
      ].join(' ');

      const middle = (startAngle + endAngle) / 2;
      const segment = {
        d,
        middle,
        item,
      };

      startAngle = endAngle;
      return segment;
    });
  }, [cx, cy, data, radius]);

  if (!segments.length) {
    return (
      <svg width={size} height={size} className="text-zinc-800">
        <circle cx={cx} cy={cy} r={radius} fill="currentColor" opacity={0.25} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((segment, index) => {
        const isActive = activeIndex === index;
        const offset = isActive ? 4 : 0;
        const dx = Math.cos(segment.middle) * offset;
        const dy = Math.sin(segment.middle) * offset;

        return (
          <path
            key={`${segment.item.label}-${index}`}
            d={segment.d}
            fill={segment.item.color}
            transform={`translate(${dx}, ${dy}) ${isActive ? `scale(1.02)` : 'scale(1)'}`}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
            className="cursor-pointer transition-transform duration-200 hover:brightness-110"
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          />
        );
      })}
    </svg>
  );
}
