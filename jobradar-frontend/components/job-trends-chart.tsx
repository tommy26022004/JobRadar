"use client";

import { useEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const ALL_CATEGORIES = [
  "Full Stack", "Frontend", "Backend", "DevOps", "Data / ML",
  "Mobile", "Design", "Marketing", "Product", "Sales", "Other",
];

// ---------------------------------------------------------------------------
// Colour derivation — consistent HSL from category name string
// ---------------------------------------------------------------------------
function categoryColor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  const hue = (sum * 137) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Series = { category: string; data: number[] };
type TrendsPayload = { dates: string[]; series: Series[] };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimeRangeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

// Format ISO date string as "May 1"
function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Range = "1h" | "1d" | "7d" | "14d" | "30d";

export function JobTrendsChart() {
  const [token, setToken] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("14d");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [availableCats] = useState<string[]>(ALL_CATEGORIES);
  const [trendsData, setTrendsData] = useState<TrendsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setToken(localStorage.getItem("access_token")); }, []);

  const authHeaders = (t: string) => ({ Authorization: `Bearer ${t}` });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (range === "1h") { params.set("hours", "1"); params.set("days", "0"); }
    else if (range === "1d") { params.set("hours", "24"); params.set("days", "0"); }
    else { params.set("days", range.replace("d", "")); params.set("hours", "0"); }
    if (selectedCats.length > 0) params.set("categories", selectedCats.join(","));
    fetch(`${BASE}/dashboard/job-trends?${params.toString()}`, { headers: authHeaders(token) })
      .then((r) => r.json())
      .then((d) => setTrendsData(d))
      .catch(() => setTrendsData(null))
      .finally(() => setLoading(false));
  }, [token, range, selectedCats]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build chart data rows: [{date: "May 1", Frontend: 3, Backend: 1, ...}]
  const chartRows =
    trendsData?.dates.map((iso, i) => {
      const row: Record<string, string | number> = { date: fmtDate(iso) };
      trendsData.series.forEach((s) => {
        row[s.category] = s.data[i] ?? 0;
      });
      return row;
    }) ?? [];

  const isEmpty = !loading && (!trendsData || trendsData.dates.length === 0);

  // Category search autocomplete list
  const filteredCats = availableCats.filter(
    (c) =>
      c.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedCats.includes(c)
  );

  function toggleCat(cat: string) {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  function removeCat(cat: string) {
    setSelectedCats((prev) => prev.filter((c) => c !== cat));
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-sm">Job Market Trends</h2>
          <div className="flex items-center gap-1">
            {(["1h", "1d", "7d", "14d", "30d"] as Range[]).map((r) => (
              <TimeRangeButton key={r} label={r} active={range === r} onClick={() => setRange(r)} />
            ))}
          </div>
        </div>

        {/* Category search + chips */}
        <div className="space-y-2">
          {/* Selected category chips */}
          {selectedCats.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedCats.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: `${categoryColor(cat)}22`,
                    color: categoryColor(cat),
                    border: `1px solid ${categoryColor(cat)}55`,
                  }}
                >
                  {cat}
                  <button
                    onClick={() => removeCat(cat)}
                    className="hover:opacity-70 transition-opacity ml-0.5"
                    aria-label={`Remove ${cat}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => setSelectedCats([])}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                clear
              </button>
            </div>
          )}

          {/* Search input */}
          <div className="relative" ref={dropdownRef}>
            <input
              type="text"
              placeholder="Search job category (e.g. Frontend, DevOps…)"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              className="h-8 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors"
            />
            {dropdownOpen && searchQuery.trim().length > 0 && filteredCats.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-w-xs rounded-lg border bg-card shadow-md overflow-hidden">
                {filteredCats.map((cat) => (
                  <button
                    key={cat}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { toggleCat(cat); setSearchQuery(""); setDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chart area */}
        <div className="h-[280px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-pulse text-xs text-muted-foreground">Loading trends…</div>
            </div>
          ) : (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--muted-foreground) / 0.15)"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    tickCount={5}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                      backgroundColor: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                  />
                  {trendsData?.series.map((s) => (
                    <Line
                      key={s.category}
                      type="monotone"
                      dataKey={s.category}
                      stroke={categoryColor(s.category)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
              {isEmpty && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                  <p className="text-sm text-muted-foreground">
                    {range === "1h" ? "No jobs discovered in the last hour" :
                     range === "1d" ? "No jobs discovered today" :
                     "No data for this period yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {range === "7d" || range === "14d" || range === "30d" ? "Try a shorter range or run a scan on Discover" : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        {!isEmpty && !loading && trendsData && trendsData.series.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center pt-1">
            {trendsData.series.map((s) => (
              <span
                key={s.category}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: categoryColor(s.category) }}
                />
                {s.category}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
