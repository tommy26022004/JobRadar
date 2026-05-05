"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, CV } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ExternalLink, Plus, ArrowLeft, Briefcase, FileText, LogOut, X, SlidersHorizontal } from "lucide-react";

type DiscoveredJob = {
  id: string;
  title: string;
  company: string;
  url: string;
  region: string;
  region_group: string;
  job_type: string;
  experience_level: string;
  score: number;
  reason: string;
  description: string;
  source: string;
};

const SOURCES = [
  { key: "wwr", label: "WeWorkRemotely" },
  { key: "remoteok", label: "RemoteOK" },
  { key: "remotive", label: "Remotive" },
];

const JOB_TYPES = [
  { key: "all", label: "All types" },
  { key: "full-time", label: "Full-time" },
  { key: "part-time", label: "Part-time" },
  { key: "contract", label: "Contract" },
  { key: "freelance", label: "Freelance" },
];

const REGIONS = [
  { key: "all", label: "Anywhere" },
  { key: "Worldwide", label: "Worldwide only" },
  { key: "Asia-Pacific", label: "Asia-Pacific" },
  { key: "Europe", label: "Europe" },
  { key: "Americas", label: "Americas" },
];

const EXP_LEVELS = [
  { key: "all", label: "All levels" },
  { key: "intern", label: "Intern" },
  { key: "entry", label: "Entry / Junior" },
  { key: "mid", label: "Mid-level" },
  { key: "senior", label: "Senior" },
  { key: "manager", label: "Manager+" },
  { key: "unknown", label: "Not specified" },
];

const SOURCE_COLORS: Record<string, string> = {
  WeWorkRemotely: "bg-blue-50 text-blue-700 border-blue-200",
  RemoteOK: "bg-green-50 text-green-700 border-green-200",
  Remotive: "bg-purple-50 text-purple-700 border-purple-200",
};

const JOB_TYPE_COLORS: Record<string, string> = {
  "full-time": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "part-time": "bg-amber-50 text-amber-700 border-amber-200",
  "contract": "bg-orange-50 text-orange-700 border-orange-200",
  "freelance": "bg-sky-50 text-sky-700 border-sky-200",
  "unknown": "bg-zinc-50 text-zinc-400 border-zinc-200",
};

const EXP_COLORS: Record<string, string> = {
  "intern": "bg-pink-50 text-pink-700 border-pink-200",
  "entry": "bg-violet-50 text-violet-700 border-violet-200",
  "mid": "bg-blue-50 text-blue-700 border-blue-200",
  "senior": "bg-rose-50 text-rose-700 border-rose-200",
  "manager": "bg-red-50 text-red-700 border-red-200",
  "unknown": "bg-zinc-50 text-zinc-400 border-zinc-200",
};

const EXP_LABELS: Record<string, string> = {
  "intern": "Intern",
  "entry": "Entry/Junior",
  "mid": "Mid-level",
  "senior": "Senior",
  "manager": "Manager+",
  "unknown": "Level ?",
};

export default function DiscoverPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [cvs, setCvs] = useState<CV[]>([]);
  const [selectedCv, setSelectedCv] = useState<number>(0);
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set(["wwr", "remoteok", "remotive"]));
  const [customUrls, setCustomUrls] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ matched: 0, total: 0, message: "" });
  const [tracking, setTracking] = useState<Set<string>>(new Set());

  // Filters (applied client-side after results arrive)
  const [filterType, setFilterType] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterExp, setFilterExp] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    api.cvs.list().then(data => {
      setCvs(data);
      if (data.length > 0) setSelectedCv(data[0].id);
    });
  }, []);

  const toggleSource = (key: string) => {
    setEnabledSources(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addCustomUrl = () => {
    const url = customInput.trim();
    if (!url) return;
    if (!url.startsWith("http")) return toast.error("URL must start with http/https");
    if (customUrls.includes(url)) return toast.error("URL already added");
    setCustomUrls(prev => [...prev, url]);
    setCustomInput("");
  };

  const removeCustomUrl = (url: string) => {
    setCustomUrls(prev => prev.filter(u => u !== url));
  };

  const handleDiscover = async () => {
    if (!selectedCv) return toast.error("Please add a CV first");
    if (enabledSources.size === 0 && customUrls.length === 0) return toast.error("Select at least one source");
    setJobs([]);
    setStatus("running");
    setProgress({ matched: 0, total: 0, message: "Starting..." });

    const token = localStorage.getItem("access_token");
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    const params = new URLSearchParams();
    params.set("cv_id", String(selectedCv));
    params.set("limit_per_source", "50");
    enabledSources.forEach(s => params.append("sources", s));
    customUrls.forEach(u => params.append("custom_urls", u));

    try {
      const res = await fetch(`${base}/discover/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to start discovery");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.event === "fetching") {
              setProgress(p => ({ ...p, message: evt.message }));
            } else if (evt.event === "fetched") {
              setProgress(p => ({ ...p, total: evt.count, message: evt.message }));
            } else if (evt.event === "matched") {
              setJobs(prev => [...prev, evt.job].sort((a, b) => b.score - a.score));
              setProgress(p => ({ ...p, matched: p.matched + 1 }));
            } else if (evt.event === "done") {
              setStatus("done");
            } else if (evt.event === "error") {
              toast.error(evt.message);
              setStatus("idle");
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Discovery failed");
      setStatus("idle");
    }
  };

  const handleTrack = async (job: DiscoveredJob) => {
    if (tracking.has(job.id)) return;
    setTracking(prev => new Set(prev).add(job.id));
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      };
      const newJob = await fetch(`${base}/jobs/`, {
        method: "POST", headers,
        body: JSON.stringify({ raw_jd: job.description, title: job.title, company: job.company }),
      }).then(r => r.json());
      await fetch(`${base}/applications/`, {
        method: "POST", headers,
        body: JSON.stringify({ job_id: newJob.id, cv_id: selectedCv }),
      });
      toast.success(`"${job.title}" added to your tracker`);
    } catch {
      toast.error("Failed to track job");
      setTracking(prev => { const s = new Set(prev); s.delete(job.id); return s; });
    }
  };

  // Client-side filter
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (filterType !== "all") {
        if (filterType === "full-time" && job.job_type !== "full-time" && job.job_type !== "unknown") return false;
        if (filterType !== "full-time" && job.job_type !== filterType) return false;
      }
      if (filterRegion !== "all") {
        if (filterRegion === "Worldwide") {
          if (job.region_group === "Americas" || job.region_group === "Europe") return false;
        } else {
          if (job.region_group !== filterRegion && job.region_group !== "Worldwide") return false;
        }
      }
      if (filterExp !== "all") {
        // "unknown" filter: show only jobs without detected level
        if (filterExp === "unknown") {
          if (job.experience_level !== "unknown") return false;
        } else {
          // hard filter: hide jobs that are clearly a different level
          // but keep "unknown" jobs since we can't rule them out
          if (job.experience_level !== filterExp && job.experience_level !== "unknown") return false;
        }
      }
      return true;
    });
  }, [jobs, filterType, filterRegion, filterExp]);

  const activeFilterCount =
    (filterType !== "all" ? 1 : 0) +
    (filterRegion !== "all" ? 1 : 0) +
    (filterExp !== "all" ? 1 : 0);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">JobRadar</Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Briefcase className="w-4 h-4" /> Jobs
            </Link>
            <Link href="/cvs" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <FileText className="w-4 h-4" /> CVs
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/jobs/new">
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Job</Button>
          </Link>
          <span className="text-sm text-muted-foreground">{user.full_name || user.email}</span>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" /></Link>
          <div>
            <h1 className="text-xl font-bold">Discover Jobs</h1>
            <p className="text-sm text-muted-foreground">AI scans real-time job postings and ranks them by how well they match your CV</p>
          </div>
        </div>

        {/* Scan config */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job Sources</p>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map(s => (
                  <button key={s.key} onClick={() => toggleSource(s.key)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${enabledSources.has(s.key) ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400 text-muted-foreground"}`}>
                    {enabledSources.has(s.key) ? "✓ " : ""}{s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom RSS Feed (optional)</p>
              <div className="flex gap-2">
                <Input placeholder="https://example.com/jobs.rss" value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomUrl()}
                  className="text-sm" />
                <Button variant="outline" size="sm" onClick={addCustomUrl}>Add</Button>
              </div>
              {customUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customUrls.map(u => (
                    <div key={u} className="flex items-center gap-1 px-2 py-1 bg-zinc-100 rounded text-xs text-zinc-600 max-w-xs">
                      <span className="truncate">{u}</span>
                      <button onClick={() => removeCustomUrl(u)} className="shrink-0 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cvs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Match with CV</p>
                <div className="flex flex-wrap gap-2">
                  {cvs.map(cv => (
                    <button key={cv.id} onClick={() => setSelectedCv(cv.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedCv === cv.id ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                      {cv.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleDiscover} disabled={status === "running" || !selectedCv} className="w-full gap-2">
              {status === "running"
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning jobs...</>
                : "Scan & Match Jobs"}
            </Button>
          </CardContent>
        </Card>

        {/* Progress */}
        {status === "running" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progress.message}</span>
              {progress.total > 0 && (
                <span className="text-muted-foreground font-medium">{progress.matched} / {progress.total} analyzed</span>
              )}
            </div>
            {progress.total > 0 && (
              <div className="w-full bg-zinc-100 rounded-full h-2">
                <div className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress.matched / progress.total) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {cvs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>You need a CV to discover matching jobs.</p>
            <Link href="/cvs" className="mt-2 inline-block text-sm text-primary hover:underline">Add your CV →</Link>
          </div>
        )}

        {/* Results */}
        {jobs.length > 0 && (
          <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {status === "done"
                  ? `${filteredJobs.length} of ${jobs.length} jobs · ${jobs.filter(j => j.score >= 70).length} strong matches`
                  : `${jobs.length} found, ranking live...`}
              </p>
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${showFilters || activeFilterCount > 0 ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </div>

            {showFilters && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job Type</p>
                      <div className="flex flex-wrap gap-1.5">
                        {JOB_TYPES.map(t => (
                          <button key={t.key} onClick={() => setFilterType(t.key)}
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterType === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Region / Timezone</p>
                      <div className="flex flex-wrap gap-1.5">
                        {REGIONS.map(r => (
                          <button key={r.key} onClick={() => setFilterRegion(r.key)}
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterRegion === r.key ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {filterRegion === "Asia-Pacific" && "Shows Asia-Pacific + Worldwide — timezone-friendly for Malaysia (UTC+8)"}
                        {filterRegion === "Worldwide" && "Excludes Americas/Europe-only roles"}
                        {filterRegion === "Europe" && "Shows Europe + Worldwide jobs"}
                        {filterRegion === "Americas" && "Shows Americas + Worldwide jobs"}
                      </p>
                    </div>
                  </div>

                  {/* Experience level filter — full width row */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Experience Level</p>
                    <div className="flex flex-wrap gap-1.5">
                      {EXP_LEVELS.map(e => (
                        <button key={e.key} onClick={() => setFilterExp(e.key)}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterExp === e.key ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                          {e.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {filterExp === "entry" && "Shows Entry/Junior + jobs without a specified level (may still be entry-friendly)"}
                      {filterExp === "intern" && "Shows internship and trainee positions only"}
                      {filterExp === "mid" && "Shows Mid-level + unspecified level jobs"}
                      {filterExp === "senior" && "Shows Senior + unspecified level jobs"}
                      {filterExp === "manager" && "Shows Manager/Director/VP level only"}
                      {filterExp === "unknown" && "Shows only jobs where experience level couldn't be detected — check manually"}
                    </p>
                  </div>

                  {activeFilterCount > 0 && (
                    <button onClick={() => { setFilterType("all"); setFilterRegion("all"); setFilterExp("all"); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline">
                      Clear all filters
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

            {filteredJobs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No jobs match the current filters.{" "}
                <button onClick={() => { setFilterType("all"); setFilterRegion("all"); }} className="underline hover:text-foreground">
                  Clear filters
                </button>
              </div>
            )}

            {filteredJobs.map(job => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-lg font-bold tabular-nums ${job.score >= 70 ? "text-green-600" : job.score >= 50 ? "text-yellow-600" : "text-zinc-400"}`}>
                          {job.score}%
                        </span>
                        <h3 className="font-semibold text-sm">{job.title}</h3>
                        {job.company && <Badge variant="outline" className="text-xs">{job.company}</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Experience level badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${EXP_COLORS[job.experience_level] || EXP_COLORS["unknown"]}`}>
                          {EXP_LABELS[job.experience_level] || "Level ?"}
                        </span>
                        {/* Job type badge */}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${JOB_TYPE_COLORS[job.job_type] || JOB_TYPE_COLORS["unknown"]}`}>
                          {job.job_type === "unknown" ? "type ?" : job.job_type}
                        </span>
                        {/* Region */}
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-zinc-50 text-zinc-600 border-zinc-200">
                          {job.region || job.region_group}
                        </span>
                        {/* Source */}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_COLORS[job.source] || "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                          {job.source}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{job.reason}</p>
                      <p className="text-xs text-zinc-400 line-clamp-2">{job.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <a href={job.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <ExternalLink className="w-3.5 h-3.5" /> View
                        </Button>
                      </a>
                      <Button size="sm" onClick={() => handleTrack(job)} disabled={tracking.has(job.id)} className="gap-1.5">
                        {tracking.has(job.id) ? "Tracked ✓" : "+ Track"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
