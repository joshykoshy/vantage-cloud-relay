"use client";

// ─────────────────────────────────────────────────────────────
// components/LatencyChart.tsx — Real-Time Latency Chart
// Uses recharts for a clean area chart of the last 20 data points.
// ─────────────────────────────────────────────────────────────

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LatencyPoint } from "@/types";

interface LatencyChartProps {
  data: LatencyPoint[];
}

// Custom tooltip for the latency chart
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
}) {
  if (active && payload && payload.length) {
    const ms = payload[0].value;
    const color = ms < 1500 ? "#4ade80" : ms < 3000 ? "#fbbf24" : "#f87171";
    return (
      <div
        className="px-3 py-2 rounded-lg text-xs"
        style={{
          background: "rgba(0,0,0,0.85)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <span style={{ color, fontFamily: "monospace", fontWeight: 600 }}>
          {ms}ms
        </span>
      </div>
    );
  }
  return null;
}

export default function LatencyChart({ data }: LatencyChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/30 text-sm font-mono">
        Waiting for first frame…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart
        data={data}
        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
      >
        <defs>
          <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4F8EF7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4F8EF7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="label"
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          unit="ms"
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="latencyMs"
          stroke="#4F8EF7"
          strokeWidth={2}
          fill="url(#latencyGradient)"
          dot={{ fill: "#4F8EF7", r: 3 }}
          activeDot={{ r: 5, fill: "#4F8EF7" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
