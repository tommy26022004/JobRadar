"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { api, Application, Job, STATUSES, Status } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useScan } from "@/lib/scan-context";
import { Loader2, Plus, Briefcase, TrendingUp, Award, Zap, ExternalLink, RefreshCw, Sparkles, CalendarClock } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const MOCK_JOBS: Job[] = [
  { id: 1001, title: "Senior Full-Stack Engineer", company: "Stripe", raw_jd: "", parsed_title: "Senior Full-Stack Engineer", parsed_company: "Stripe", parsed_stack: "React,TypeScript,Go,PostgreSQL", parsed_requirements: null, parsed_salary: "$140k–$180k/yr", created_at: "" },
  { id: 1002, title: "Backend Engineer – Platform", company: "Notion", raw_jd: "", parsed_title: "Backend Engineer – Platform", parsed_company: "Notion", parsed_stack: "Python,FastAPI,Redis,AWS", parsed_requirements: null, parsed_salary: "$120k–$160k/yr", created_at: "" },
  { id: 1003, title: "Frontend Engineer", company: "Linear", raw_jd: "", parsed_title: "Frontend Engineer", parsed_company: "Linear", parsed_stack: "React,TypeScript,GraphQL", parsed_requirements: null, parsed_salary: "$110k–$145k/yr", created_at: "" },
  { id: 1004, title: "Software Engineer II", company: "Vercel", raw_jd: "", parsed_title: "Software Engineer II", parsed_company: "Vercel", parsed_stack: "Next.js,Rust,Edge Runtime", parsed_requirements: null, parsed_salary: "$130k–$170k/yr", created_at: "" },
  { id: 1005, title: "Full-Stack Developer", company: "Supabase", raw_jd: "", parsed_title: "Full-Stack Developer", parsed_company: "Supabase", parsed_stack: "TypeScript,PostgreSQL,Deno", parsed_requirements: null, parsed_salary: "$100k–$140k/yr", created_at: "" },
  { id: 1006, title: "Staff Engineer – APIs", company: "Twilio", raw_jd: "", parsed_title: "Staff Engineer – APIs", parsed_company: "Twilio", parsed_stack: "Node.js,Python,Kafka,GCP", parsed_requirements: null, parsed_salary: "$160k–$210k/yr", created_at: "" },
  { id: 1007, title: "React Native Engineer", company: "Spotify", raw_jd: "", parsed_title: "React Native Engineer", parsed_company: "Spotify", parsed_stack: "React Native,TypeScript,GraphQL", parsed_requirements: null, parsed_salary: "$115k–$155k/yr", created_at: "" },
];

const MOCK_APPS: AppWithJob[] = [
  { id: 2001, job_id: 1001, cv_id: 1, status: "interview", match_score: 87, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[0] },
  { id: 2002, job_id: 1002, cv_id: 1, status: "applied",   match_score: 79, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[1] },
  { id: 2003, job_id: 1003, cv_id: 1, status: "applied",   match_score: 74, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[2] },
  { id: 2004, job_id: 1004, cv_id: 1, status: "offer",     match_score: 91, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[3] },
  { id: 2005, job_id: 1005, cv_id: 1, status: "saved",     match_score: 68, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[4] },
  { id: 2006, job_id: 1006, cv_id: 1, status: "rejected",  match_score: 55, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[5] },
  { id: 2007, job_id: 1007, cv_id: 1, status: "saved",     match_score: 72, ai_analysis: null, cv_suggestions: null, interview_at: null, notes: null, created_at: "", updated_at: null, job: MOCK_JOBS[6] },
];

const MOCK_STATS: Stats = {
  total_jobs: 7,
  by_status: { saved: 2, applied: 2, interview: 1, offer: 1, rejected: 1 },
  avg_score: 75,
  quota: { remaining_requests: 14399, limit_requests: 14400, reset_requests: "6s" },
  provider: "groq",
};

const STATUS_LABELS: Record<Status, string> = {
  saved: "Saved", applied: "Applied", interview: "Interview",
  offer: "Offer 🎉", rejected: "Rejected",
};

const STATUS_COLORS: Record<Status, string> = {
  saved: "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  interview: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  offer: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const COL_ACCENT: Record<Status, { dot: string; text: string; header: string; glow: string }> = {
  saved:     { dot: "bg-zinc-400",   text: "text-zinc-500 dark:text-zinc-300",   header: "bg-zinc-100 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700",   glow: "shadow-zinc-500/10" },
  applied:   { dot: "bg-blue-500",   text: "text-blue-600 dark:text-blue-400",   header: "bg-blue-50 dark:bg-blue-950/50 border-b border-blue-100 dark:border-blue-900",   glow: "shadow-blue-500/10" },
  interview: { dot: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400", header: "bg-yellow-50 dark:bg-yellow-950/50 border-b border-yellow-100 dark:border-yellow-900", glow: "shadow-yellow-500/10" },
  offer:     { dot: "bg-green-500",  text: "text-green-600 dark:text-green-400",  header: "bg-green-50 dark:bg-green-950/50 border-b border-green-100 dark:border-green-900",  glow: "shadow-green-500/10" },
  rejected:  { dot: "bg-red-400",    text: "text-red-500 dark:text-red-400",    header: "bg-red-50 dark:bg-red-950/50 border-b border-red-100 dark:border-red-900",    glow: "shadow-red-500/10" },
};

const EXP_COLORS: Record<string, string> = {
  intern: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  entry: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  mid: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  senior: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  manager: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  unknown: "bg-muted text-muted-foreground",
};

type AppWithJob = Application & { job?: Job };

type Stats = {
  total_jobs: number;
  by_status: Record<Status, number>;
  avg_score: number;
  quota: {
    remaining_requests?: number; limit_requests?: number;
    remaining_tokens?: number; limit_tokens?: number; reset_requests?: string;
  };
  provider: string;
};

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-xl shrink-0 ${color || "bg-muted"}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatCountdown(dateStr: string): { label: string; urgent: boolean } {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return { label: "Past", urgent: false };
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return { label: "< 1h", urgent: true };
  if (hours < 24) return { label: `${hours}h`, urgent: hours < 6 };
  const days = Math.floor(hours / 24);
  if (days === 1) return { label: "Tomorrow", urgent: false };
  return { label: `${days}d`, urgent: false };
}

function UpcomingInterviews({ apps }: { apps: AppWithJob[] }) {
  const upcoming = apps
    .filter(a => a.interview_at && new Date(a.interview_at) > new Date())
    .sort((a, b) => new Date(a.interview_at!).getTime() - new Date(b.interview_at!).getTime())
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="w-4 h-4 text-yellow-500" />
        <h2 className="font-semibold text-sm">Upcoming Interviews</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {upcoming.map(app => {
          const { label, urgent } = formatCountdown(app.interview_at!);
          return (
            <div key={app.id} onClick={() => window.location.href = `/jobs/${app.job_id}`}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card border-border/60 hover:border-yellow-500/50 hover:shadow-sm cursor-pointer transition-all">
              <div className={`shrink-0 px-2 py-1 rounded-md text-xs font-bold tabular-nums ${urgent ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"}`}>
                {label}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{app.job?.parsed_title || app.job?.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{app.job?.parsed_company || app.job?.company}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(app.interview_at!).toLocaleString("vi-VN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { feed, refreshFeed, autoScan, autoScanStatus } = useScan();
  const [apps, setApps] = useState<AppWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [feedPage, setFeedPage] = useState(0);
  const [isMock, setIsMock] = useState(false);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

  useEffect(() => {
    Promise.all([
      api.applications.list(),
      api.jobs.list(),
      fetch(`${BASE}/dashboard/stats`, { headers: authHeader() }).then(r => r.json()),
    ]).then(([applications, jobs, s]) => {
      if (applications.length === 0) {
        setApps(MOCK_APPS);
        setStats(MOCK_STATS);
        setIsMock(true);
      } else {
        const jobMap = Object.fromEntries(jobs.map((j: Job) => [j.id, j]));
        setApps(applications.map((a: Application) => ({ ...a, job: jobMap[a.job_id] })));
        setStats(s);
      }
    }).catch(() => toast.error("Failed to load dashboard")).finally(() => setLoading(false));
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as Status;
    const appId = parseInt(result.draggableId);
    setApps(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus } : a));
    if (isMock) return; // mock data — don't call API
    try {
      await api.applications.update(appId, { status: newStatus });
      fetch(`${BASE}/dashboard/stats`, { headers: authHeader() }).then(r => r.json()).then(setStats);
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const columns = STATUSES.map(status => ({ status, apps: apps.filter(a => a.status === status) }));
  const quotaUsedReq = stats?.quota?.limit_requests && stats?.quota?.remaining_requests !== undefined
    ? stats.quota.limit_requests - stats.quota.remaining_requests : 0;

  const feedJobs = feed.jobs;
  const isAutoScanning = autoScan.status === "running";
  const newCount = feed.new_count;
  const PAGE_SIZE = 5;
  const totalPages = Math.ceil(feedJobs.length / PAGE_SIZE);
  const pagedJobs = feedJobs.slice(feedPage * PAGE_SIZE, (feedPage + 1) * PAGE_SIZE);

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <StatCard icon={<Briefcase className="w-4 h-4 text-blue-600" />} label="Jobs Tracked"
          value={stats?.total_jobs ?? apps.length}
          sub={`${stats?.by_status.applied ?? 0} applied · ${stats?.by_status.interview ?? 0} interviews`}
          color="bg-blue-100 dark:bg-blue-900/40" />
        <StatCard icon={<Award className="w-4 h-4 text-green-600" />} label="Avg Match Score"
          value={stats?.avg_score ? `${stats.avg_score}%` : "—"}
          sub="across all tracked jobs" color="bg-green-100 dark:bg-green-900/40" />
        <StatCard icon={<TrendingUp className="w-4 h-4 text-violet-600" />} label="Offer / Interview"
          value={`${stats?.by_status.offer ?? 0} / ${stats?.by_status.interview ?? 0}`}
          sub={`${stats?.by_status.rejected ?? 0} rejected`} color="bg-violet-100 dark:bg-violet-900/40" />
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Zap className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">AI Quota</p>
                <p className="text-xs font-medium capitalize">{stats?.provider || "groq"}</p>
              </div>
            </div>
            {stats?.quota?.limit_requests ? (
              <QuotaBar used={quotaUsedReq} total={stats.quota.limit_requests} label="Requests today" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {stats?.provider === "groq" ? "Fetching quota..." : "N/A for this provider"}
              </p>
            )}
            {stats?.quota?.reset_requests && (
              <p className="text-xs text-muted-foreground">Resets in {stats.quota.reset_requests}</p>
            )}
            <Link href="/settings" className="text-xs text-primary hover:underline">Change API key →</Link>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Interviews */}
      <UpcomingInterviews apps={apps} />

      {/* Kanban + New Matches */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 flex-1 min-h-0">
        {/* Kanban */}
        <div className="xl:col-span-3 flex flex-col gap-3 min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">Application Board</h2>
              {isMock && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  sample data
                </span>
              )}
            </div>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 overflow-y-auto flex-1 min-h-0">
                {columns.map(({ status, apps: colApps }) => {
                  const accent = COL_ACCENT[status];
                  return (
                    <div key={status} className="flex flex-col min-h-0">
                      {/* Column header */}
                      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${accent.header}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${accent.dot}`} />
                          <span className={`text-[11px] font-bold uppercase tracking-widest ${accent.text}`}>
                            {STATUS_LABELS[status].replace(" 🎉", "")}
                          </span>
                        </div>
                        <span className={`text-[11px] font-bold ${accent.text} opacity-80`}>{colApps.length}</span>
                      </div>
                      <Droppable droppableId={status}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps}
                            className={`flex-1 rounded-b-xl p-1.5 space-y-1.5 transition-colors border border-t-0 ${snapshot.isDraggingOver ? "bg-muted/60 border-border" : "bg-muted/20 border-border/40"}`}
                            style={{ minHeight: "200px" }}>
                            {colApps.map((app, index) => (
                              <Draggable key={app.id} draggableId={String(app.id)} index={index}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                    className={`transition-transform ${snapshot.isDragging ? "scale-[1.02] rotate-1 shadow-xl" : ""}`}
                                    onClick={() => !isMock && router.push(`/jobs/${app.job_id}`)}>
                                    <div className={`rounded-lg border bg-card p-2.5 space-y-1.5 transition-all shadow-sm ${isMock ? "cursor-default" : "cursor-pointer hover:shadow-md hover:border-primary/40"} border-border/60`}>
                                      <p className="text-[11px] font-semibold leading-snug line-clamp-2 text-foreground">
                                        {app.job?.parsed_title || app.job?.title || "Untitled"}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground font-medium truncate">
                                        {app.job?.parsed_company || app.job?.company || "—"}
                                      </p>
                                      {app.match_score !== null && (
                                        <div className="pt-0.5">
                                          <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">match</span>
                                            <span className={`text-[11px] font-bold tabular-nums ${app.match_score >= 75 ? "text-green-500" : app.match_score >= 55 ? "text-yellow-500" : "text-red-400"}`}>
                                              {app.match_score}%
                                            </span>
                                          </div>
                                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${app.match_score >= 75 ? "bg-green-500" : app.match_score >= 55 ? "bg-yellow-500" : "bg-red-400"}`}
                                              style={{ width: `${app.match_score}%` }} />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </div>

        {/* New Matches panel */}
        <div className="xl:col-span-2 min-h-0 flex flex-col">
          <Card className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">New Matches For You</h2>
                {newCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    {newCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {feed.next_scan_in_minutes !== null && feed.next_scan_in_minutes > 0 && (
                  <span className="text-xs text-muted-foreground">
                    next scan in {feed.next_scan_in_minutes}m
                  </span>
                )}
                <button onClick={refreshFeed} disabled={isAutoScanning}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${isAutoScanning ? "animate-spin" : ""}`} />
                  {isAutoScanning ? "Scanning..." : "Refresh"}
                </button>
              </div>
            </div>

            {feed.total_today > 0 && (
              <p className="text-xs text-muted-foreground px-4 pt-2 shrink-0">
                {feed.total_today} matches found today
              </p>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

          {/* Auto-scanning skeleton */}
          {isAutoScanning && feedJobs.length === 0 && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-3">
                    <div className="h-3 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-3 bg-muted/60 rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
              <p className="text-xs text-center text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                Auto-scanning for new jobs...
              </p>
            </div>
          )}

          {/* Empty state */}
          {!isAutoScanning && feedJobs.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center space-y-2">
                <Sparkles className="w-6 h-6 text-muted-foreground mx-auto" />
                {autoScanStatus === "no_cv" ? (
                  <>
                    <p className="text-sm text-muted-foreground">Add a CV to enable auto-scan</p>
                    <p className="text-xs text-muted-foreground">Auto-scan needs your CV to find matching jobs</p>
                    <Link href="/cvs" className="text-xs text-primary hover:underline block">Upload your CV →</Link>
                  </>
                ) : autoScanStatus === "cached" ? (
                  <>
                    <p className="text-sm text-muted-foreground">No new jobs found yet today</p>
                    <p className="text-xs text-muted-foreground">Next scan in {feed.next_scan_in_minutes ?? "—"}m</p>
                    <Link href="/discover" className="text-xs text-primary hover:underline block">Run a deep scan on Discover →</Link>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Auto-scan will find matching jobs for you</p>
                    <p className="text-xs text-muted-foreground">Runs automatically every 4 hours when you're online</p>
                    <Link href="/discover" className="text-xs text-primary hover:underline block">Or run a deep scan on Discover →</Link>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Job list */}
          {feedJobs.length > 0 && (
            <div className="space-y-2">
              {pagedJobs.map((m, i) => (
                <Card key={i} className={`hover:shadow-md transition-shadow ${m.is_new ? "border-primary/30" : ""}`}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-bold tabular-nums ${m.score >= 70 ? "text-green-600" : "text-yellow-600"}`}>
                            {m.score}%
                          </span>
                          <span className="text-xs font-medium truncate">{m.title}</span>
                          {m.is_new && (
                            <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">NEW</span>
                          )}
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
                        className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setFeedPage(p => Math.max(0, p - 1))}
                    disabled={feedPage === 0}
                    className="text-xs px-2.5 py-1 rounded border disabled:opacity-30 hover:bg-muted transition-colors"
                  >← Prev</button>
                  <span className="text-xs text-muted-foreground">
                    {feedPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setFeedPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={feedPage === totalPages - 1}
                    className="text-xs px-2.5 py-1 rounded border disabled:opacity-30 hover:bg-muted transition-colors"
                  >Next →</button>
                </div>
              )}

              <Link href="/discover" className="block text-center text-xs text-primary hover:underline py-1">
                Run deep scan for more results →
              </Link>
            </div>
          )}

            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
