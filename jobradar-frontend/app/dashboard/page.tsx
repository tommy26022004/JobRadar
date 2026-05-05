"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { api, Application, Job, STATUSES, Status } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Briefcase, TrendingUp, Award, Zap, ExternalLink, RefreshCw } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const STATUS_LABELS: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer 🎉",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<Status, string> = {
  saved: "bg-zinc-100 text-zinc-700",
  applied: "bg-blue-100 text-blue-700",
  interview: "bg-yellow-100 text-yellow-700",
  offer: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const EXP_COLORS: Record<string, string> = {
  intern: "bg-pink-50 text-pink-700",
  entry: "bg-violet-50 text-violet-700",
  mid: "bg-blue-50 text-blue-700",
  senior: "bg-rose-50 text-rose-700",
  manager: "bg-red-50 text-red-700",
  unknown: "bg-zinc-50 text-zinc-500",
};

type AppWithJob = Application & { job?: Job };

type Stats = {
  total_jobs: number;
  by_status: Record<Status, number>;
  avg_score: number;
  quota: {
    remaining_requests?: number;
    limit_requests?: number;
    remaining_tokens?: number;
    limit_tokens?: number;
    reset_requests?: string;
  };
  provider: string;
};

type Match = {
  title: string;
  company: string;
  url: string;
  score: number;
  reason: string;
  source: string;
  experience_level: string;
};

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`p-2 rounded-lg ${color || "bg-zinc-100"}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function QuotaBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{(total - used).toLocaleString()} / {total.toLocaleString()} remaining</span>
      </div>
      <div className="w-full bg-zinc-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesScanned, setMatchesScanned] = useState(0);

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

  useEffect(() => {
    // Load kanban + stats in parallel
    Promise.all([
      api.applications.list(),
      api.jobs.list(),
      fetch(`${BASE}/dashboard/stats`, { headers: authHeader() }).then(r => r.json()),
    ]).then(([applications, jobs, s]) => {
      const jobMap = Object.fromEntries(jobs.map((j: Job) => [j.id, j]));
      setApps(applications.map((a: Application) => ({ ...a, job: jobMap[a.job_id] })));
      setStats(s);
    }).catch(() => toast.error("Failed to load dashboard")).finally(() => setLoading(false));
  }, []);

  const loadNewMatches = async () => {
    setMatchesLoading(true);
    setMatches([]);
    try {
      const r = await fetch(`${BASE}/dashboard/new-matches`, { headers: authHeader() });
      const data = await r.json();
      setMatches(data.matches || []);
      setMatchesScanned(data.total_scanned || 0);
    } catch {
      toast.error("Failed to load matches");
    } finally {
      setMatchesLoading(false);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as Status;
    const appId = parseInt(result.draggableId);
    setApps(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus } : a));
    try {
      await api.applications.update(appId, { status: newStatus });
      // Refresh stats after status change
      fetch(`${BASE}/dashboard/stats`, { headers: authHeader() })
        .then(r => r.json()).then(setStats);
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const columns = STATUSES.map(status => ({
    status,
    apps: apps.filter(a => a.status === status),
  }));

  const quotaUsedReq = stats?.quota?.limit_requests && stats?.quota?.remaining_requests !== undefined
    ? stats.quota.limit_requests - stats.quota.remaining_requests
    : 0;

  return (
    <div className="space-y-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Briefcase className="w-4 h-4 text-blue-600" />}
          label="Jobs Tracked"
          value={stats?.total_jobs ?? apps.length}
          sub={`${stats?.by_status.applied ?? 0} applied · ${stats?.by_status.interview ?? 0} interviews`}
          color="bg-blue-50"
        />
        <StatCard
          icon={<Award className="w-4 h-4 text-green-600" />}
          label="Avg Match Score"
          value={stats?.avg_score ? `${stats.avg_score}%` : "—"}
          sub="across all tracked jobs"
          color="bg-green-50"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
          label="Offer / Interview"
          value={`${stats?.by_status.offer ?? 0} / ${stats?.by_status.interview ?? 0}`}
          sub={`${stats?.by_status.rejected ?? 0} rejected`}
          color="bg-violet-50"
        />

        {/* AI Quota card */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-50">
                <Zap className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">AI Quota</p>
                <p className="text-xs font-medium capitalize">{stats?.provider || "groq"}</p>
              </div>
            </div>
            {stats?.quota?.limit_requests ? (
              <QuotaBar
                used={quotaUsedReq}
                total={stats.quota.limit_requests}
                label="Requests today"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {stats?.provider === "groq" ? "Fetching quota..." : "N/A for this provider"}
              </p>
            )}
            {stats?.quota?.reset_requests && (
              <p className="text-xs text-muted-foreground">Resets in {stats.quota.reset_requests}</p>
            )}
            <Link href="/settings" className="text-xs text-primary hover:underline">
              Change API key →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Main content: Kanban + New Matches */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Kanban — 3/5 width */}
        <div className="xl:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Application Board</h2>
            <Link href="/jobs/new" className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add job
            </Link>
          </div>

          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center border-2 border-dashed rounded-xl">
              <p className="text-muted-foreground text-sm mb-3">No jobs tracked yet</p>
              <button onClick={() => router.push("/jobs/new")}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                <Plus className="w-4 h-4" /> Add your first job
              </button>
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {columns.map(({ status, apps: colApps }) => (
                  <div key={status} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {STATUS_LABELS[status]}
                      </span>
                      <span className="text-xs text-muted-foreground">{colApps.length}</span>
                    </div>
                    <Droppable droppableId={status}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`min-h-20 rounded-lg p-1.5 transition-colors ${snapshot.isDraggingOver ? "bg-zinc-200" : "bg-zinc-100"}`}>
                          {colApps.map((app, index) => (
                            <Draggable key={app.id} draggableId={String(app.id)} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  className={`mb-1.5 ${snapshot.isDragging ? "opacity-80" : ""}`}
                                  onClick={() => router.push(`/jobs/${app.job_id}`)}>
                                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                                    <CardContent className="p-2.5 space-y-1">
                                      <p className="text-xs font-medium leading-tight line-clamp-2">
                                        {app.job?.parsed_title || app.job?.title || "Untitled"}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {app.job?.parsed_company || app.job?.company || "—"}
                                      </p>
                                      {app.match_score !== null && (
                                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[status]}`}>
                                          {app.match_score}%
                                        </Badge>
                                      )}
                                    </CardContent>
                                  </Card>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          )}
        </div>

        {/* New Matches panel — 2/5 width */}
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm">New Matches For You</h2>
              {matchesScanned > 0 && (
                <p className="text-xs text-muted-foreground">from {matchesScanned} jobs scanned</p>
              )}
            </div>
            <button onClick={loadNewMatches} disabled={matchesLoading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${matchesLoading ? "animate-spin" : ""}`} />
              {matchesLoading ? "Scanning..." : "Refresh"}
            </button>
          </div>

          {!matchesLoading && matches.length === 0 && matchesScanned === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Click Refresh to scan latest remote jobs and find matches for your CV
                </p>
                <button onClick={loadNewMatches}
                  className="text-sm text-primary hover:underline flex items-center gap-1.5 mx-auto">
                  <Zap className="w-4 h-4" /> Find matching jobs
                </button>
              </CardContent>
            </Card>
          )}

          {matchesLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-3">
                    <div className="h-3 bg-zinc-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-zinc-100 rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!matchesLoading && matches.length > 0 && (
            <div className="space-y-2">
              {matches.map((m, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-bold tabular-nums ${m.score >= 70 ? "text-green-600" : "text-yellow-600"}`}>
                            {m.score}%
                          </span>
                          <span className="text-xs font-medium truncate">{m.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{m.company}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${EXP_COLORS[m.experience_level] || EXP_COLORS.unknown}`}>
                            {m.experience_level === "unknown" ? "Level ?" : m.experience_level}
                          </span>
                          <span className="text-xs text-zinc-400">{m.source}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.reason}</p>
                      </div>
                      <a href={m.url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1.5 rounded hover:bg-zinc-100 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Link href="/discover"
                className="block text-center text-xs text-primary hover:underline py-2">
                See all jobs on Discover →
              </Link>
            </div>
          )}

          {!matchesLoading && matchesScanned > 0 && matches.length === 0 && (
            <Card>
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                No strong matches found (≥50%) in latest scan.{" "}
                <Link href="/discover" className="text-primary hover:underline">Try full scan →</Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
