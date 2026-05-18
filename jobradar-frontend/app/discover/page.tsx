"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, CV } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useScan } from "@/lib/scan-context";
import {
  Loader2, ExternalLink, Plus, ArrowLeft, Briefcase,
  FileText, LogOut, X, SlidersHorizontal, Compass,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type DiscoveredJob = {
  id: string; title: string; company: string; url: string;
  region: string; region_group: string; job_type: string;
  experience_level: string; score: number; reason: string;
  description: string; source: string;
};

const SOURCES = [
  { key: "wwr", label: "WeWorkRemotely" },
  { key: "remoteok", label: "RemoteOK" },
  { key: "remotive", label: "Remotive" },
  { key: "jobicy", label: "Jobicy" },
  { key: "arbeitnow", label: "Arbeitnow" },
];
const JOB_TYPES = [
  { key: "all", label: "All types" }, { key: "full-time", label: "Full-time" },
  { key: "part-time", label: "Part-time" }, { key: "contract", label: "Contract" },
  { key: "freelance", label: "Freelance" },
];
const REGIONS = [
  { key: "all", label: "Anywhere" }, { key: "Worldwide", label: "Worldwide only" },
  { key: "Asia-Pacific", label: "Asia-Pacific" }, { key: "Europe", label: "Europe" },
  { key: "Americas", label: "Americas" },
];
const EXP_LEVELS = [
  { key: "all", label: "All levels" }, { key: "intern", label: "Intern" },
  { key: "entry", label: "Entry / Junior" }, { key: "mid", label: "Mid-level" },
  { key: "senior", label: "Senior" }, { key: "manager", label: "Manager+" },
  { key: "unknown", label: "Not specified" },
];
const SOURCE_COLORS: Record<string, string> = {
  WeWorkRemotely: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  RemoteOK: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  Remotive: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
};
const JOB_TYPE_COLORS: Record<string, string> = {
  "full-time": "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  "part-time": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  "contract": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  "freelance": "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800",
  "unknown": "bg-muted text-muted-foreground border-border",
};
const EXP_COLORS: Record<string, string> = {
  "intern": "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800",
  "entry": "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800",
  "mid": "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  "senior": "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800",
  "manager": "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  "unknown": "bg-muted text-muted-foreground border-border",
};
const EXP_LABELS: Record<string, string> = {
  "intern": "Intern", "entry": "Entry/Junior", "mid": "Mid-level",
  "senior": "Senior", "manager": "Manager+", "unknown": "Level ?",
};

export default function DiscoverPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { hardScan: scan, setHardScan: setScan, startHardScanPolling: startPolling } = useScan();
  const [cvs, setCvs] = useState<CV[]>([]);
  const [cvsLoaded, setCvsLoaded] = useState(false);
  const [selectedCv, setSelectedCv] = useState<number>(0);
  const [enabledSources, setEnabledSources] = useState<Set<string>>(new Set(["wwr", "remoteok", "remotive", "jobicy", "arbeitnow"]));
  const [customUrls, setCustomUrls] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [tracking, setTracking] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterExp, setFilterExp] = useState("all");
  const [minScore, setMinScore] = useState(40);
  const [showFilters, setShowFilters] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const analyzeStartRef = useRef<number | null>(null);
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);

  // Animate steps with slight delay so user sees them tick one by one
  useEffect(() => {
    if (scan.status === "idle") {
      setStep1Done(false);
      setStep2Done(false);
      return;
    }
    if (scan.total > 0 || scan.status === "done") {
      const t1 = setTimeout(() => setStep1Done(true), 300);
      const t2 = setTimeout(() => setStep2Done(true), 900);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [scan.total, scan.status]);

  useEffect(() => {
    if (scan.status !== "running" || scan.total === 0) {
      analyzeStartRef.current = null;
      setEta(null);
      return;
    }
    if (scan.matched > 0 && analyzeStartRef.current === null) {
      analyzeStartRef.current = Date.now();
    }
    if (analyzeStartRef.current && scan.matched > 0) {
      // Update ETA every second using a ticker for smooth countdown
      const tick = () => {
        if (!analyzeStartRef.current) return;
        const elapsed = (Date.now() - analyzeStartRef.current) / 1000;
        const rate = elapsed / scan.matched;
        const remaining = Math.ceil(rate * (scan.total - scan.matched));
        setEta(remaining > 0 ? remaining : null);
      };
      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }
  }, [scan.matched, scan.total, scan.status]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    api.cvs.list().then(data => {
      setCvs(data);
      if (data.length > 0) setSelectedCv(data[0].id);
      setCvsLoaded(true);
    });
  }, []);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

  const toggleSource = (key: string) => setEnabledSources(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const addCustomUrl = () => {
    const url = customInput.trim();
    if (!url) return;
    if (!url.startsWith("http")) return toast.error("URL must start with http/https");
    if (customUrls.includes(url)) return toast.error("Already added");
    setCustomUrls(prev => [...prev, url]);
    setCustomInput("");
  };

  const handleDiscover = async () => {
    if (!selectedCv) return toast.error("Please add a CV first");
    if (enabledSources.size === 0 && customUrls.length === 0) return toast.error("Select at least one source");

    setScan({ scan_id: null, status: "running", total: 0, matched: 0, message: "Starting...", results: [] });

    const params = new URLSearchParams();
    params.set("cv_id", String(selectedCv));
    params.set("limit_per_source", "20");
    enabledSources.forEach(s => params.append("sources", s));
    customUrls.forEach(u => params.append("custom_urls", u));

    try {
      const r = await fetch(`${BASE}/discover/start?${params}`, { method: "POST", headers: authHeader() });
      if (!r.ok) throw new Error((await r.json()).detail || "Failed to start scan");
      const { scan_id } = await r.json();
      setScan(prev => ({ ...prev, scan_id }));
      startPolling(scan_id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start scan");
      setScan(prev => ({ ...prev, status: "idle" }));
    }
  };

  const handleTrack = async (job: DiscoveredJob) => {
    if (tracking.has(job.id)) return;
    setTracking(prev => new Set(prev).add(job.id));
    try {
      const headers = { "Content-Type": "application/json", ...authHeader() };
      const newJob = await fetch(`${BASE}/jobs/`, {
        method: "POST", headers,
        body: JSON.stringify({ raw_jd: job.description, title: job.title, company: job.company }),
      }).then(r => r.json());
      await fetch(`${BASE}/applications/`, {
        method: "POST", headers,
        body: JSON.stringify({ job_id: newJob.id, cv_id: selectedCv }),
      });
      toast.success(`"${job.title}" added to tracker`);
    } catch {
      toast.error("Failed to track job");
      setTracking(prev => { const s = new Set(prev); s.delete(job.id); return s; });
    }
  };

  const filteredJobs = useMemo(() => {
    return scan.results.filter(job => {
      if (job.score < minScore) return false;
      if (filterType !== "all") {
        if (filterType === "full-time" && job.job_type !== "full-time" && job.job_type !== "unknown") return false;
        if (filterType !== "full-time" && job.job_type !== filterType) return false;
      }
      if (filterRegion !== "all") {
        if (filterRegion === "Worldwide" && (job.region_group === "Americas" || job.region_group === "Europe")) return false;
        if (filterRegion !== "Worldwide" && job.region_group !== filterRegion && job.region_group !== "Worldwide") return false;
      }
      if (filterExp !== "all") {
        if (filterExp === "unknown" && job.experience_level !== "unknown") return false;
        if (filterExp !== "unknown" && job.experience_level !== filterExp && job.experience_level !== "unknown") return false;
      }
      return true;
    });
  }, [scan.results, filterType, filterRegion, filterExp, minScore]);

  const activeFilterCount = (filterType !== "all" ? 1 : 0) + (filterRegion !== "all" ? 1 : 0) + (filterExp !== "all" ? 1 : 0) + (minScore !== 40 ? 1 : 0);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">JobRadar</Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard" className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Briefcase className="w-4 h-4" /> Jobs</Link>
            <Link href="/cvs" className="flex items-center gap-1.5 hover:text-foreground transition-colors"><FileText className="w-4 h-4" /> CVs</Link>
            <Link href="/discover" className="flex items-center gap-1.5 text-foreground font-medium"><Compass className="w-4 h-4" /> Discover</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/jobs/new"><Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Job</Button></Link>
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

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job Sources</p>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map(s => (
                  <button key={s.key} onClick={() => toggleSource(s.key)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${enabledSources.has(s.key) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground text-muted-foreground"}`}>
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
                  onKeyDown={e => e.key === "Enter" && addCustomUrl()} className="text-sm" />
                <Button variant="outline" size="sm" onClick={addCustomUrl}>Add</Button>
              </div>
              {customUrls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customUrls.map(u => (
                    <div key={u} className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs text-muted-foreground max-w-xs">
                      <span className="truncate">{u}</span>
                      <button onClick={() => setCustomUrls(prev => prev.filter(x => x !== u))} className="shrink-0 hover:text-red-500"><X className="w-3 h-3" /></button>
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
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedCv === cv.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground"}`}>
                      {cv.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleDiscover} disabled={scan.status === "running" || !selectedCv} className="flex-1 gap-2">
                {scan.status === "running"
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning in background...</>
                  : "Scan & Match Jobs"}
              </Button>
              {scan.status === "running" && (
                <p className="text-xs text-muted-foreground">You can navigate away — scan continues in background</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {(scan.status === "running" || (scan.status === "done" && scan.total > 0)) && (() => {
          const fetchedMatch = scan.message.match(/Found (\d+) jobs/);
          const totalFetched = fetchedMatch ? fetchedMatch[1] : null;
          const pct = scan.total > 0 ? Math.min((scan.matched / scan.total) * 100, 100) : 0;

          const steps = [
            { label: totalFetched ? `Fetched ${totalFetched} jobs` : "Fetching jobs…", done: step1Done },
            { label: scan.total > 0 ? `Filtered to ${scan.total} relevant` : "Filtering by CV…", done: step2Done },
            { label: scan.total > 0 ? `Analyzing ${scan.matched} / ${scan.total} jobs` : "Analyzing…", done: scan.status === "done" },
          ];
          const activeStep = steps.findIndex(s => !s.done);

          return (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              {/* Steps */}
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 transition-all duration-500 ${
                      step.done ? "bg-green-500 scale-90" :
                      i === activeStep ? "bg-primary animate-pulse" :
                      "bg-muted-foreground/30"
                    }`} />
                    <span className={`text-sm transition-all duration-300 ${
                      step.done ? "text-muted-foreground line-through decoration-muted-foreground/40" :
                      i === activeStep ? "text-foreground font-medium" :
                      "text-muted-foreground"
                    }`}>
                      {step.label}
                    </span>
                    {i === activeStep && eta !== null && scan.status === "running" && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">~{eta}s</span>
                    )}
                    {step.done && i === steps.length - 1 && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
                        {filteredJobs.length} shown · {scan.total - filteredJobs.length} filtered/skipped
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {scan.total > 0 && (
                <div className="w-full bg-muted rounded-full h-1">
                  <div
                    className={`h-1 rounded-full transition-all duration-700 ease-out ${scan.status === "done" ? "bg-green-500" : "bg-primary"}`}
                    style={{ width: `${scan.status === "done" ? 100 : pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {cvsLoaded && cvs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>You need a CV to discover matching jobs.</p>
            <Link href="/cvs" className="mt-2 inline-block text-sm text-primary hover:underline">Add your CV →</Link>
          </div>
        )}

        {/* Results */}
        {scan.results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {scan.status === "done"
                  ? (() => {
                      const strong = scan.results.filter(j => j.score >= 70).length;
                      const mid = scan.results.filter(j => j.score >= 50 && j.score < 70).length;
                      return `${filteredJobs.length} jobs found${strong > 0 ? ` · ${strong} strong matches (≥70%)` : mid > 0 ? ` · ${mid} good matches (≥50%)` : " · try a more detailed CV for better results"}`;
                    })()
                  : `${filteredJobs.length} showing · ${scan.results.length} analyzed so far…`}
              </p>
              <button onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${showFilters || activeFilterCount > 0 ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground"}`}>
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
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterType === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground"}`}>
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
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterRegion === r.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground"}`}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {filterRegion === "Asia-Pacific" && "Timezone-friendly for Malaysia (UTC+8)"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Experience Level</p>
                    <div className="flex flex-wrap gap-1.5">
                      {EXP_LEVELS.map(e => (
                        <button key={e.key} onClick={() => setFilterExp(e.key)}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterExp === e.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground"}`}>
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Min Match Score</p>
                      <span className={`text-sm font-bold ${minScore >= 70 ? "text-green-600" : minScore >= 50 ? "text-yellow-600" : "text-zinc-500"}`}>{minScore}%</span>
                    </div>
                    <input type="range" min={0} max={90} step={5} value={minScore}
                      onChange={e => setMinScore(Number(e.target.value))}
                      className="w-full accent-primary" />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0% (show all)</span>
                      <span>50% (good)</span>
                      <span>70% (strong)</span>
                      <span>90%</span>
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <button onClick={() => { setFilterType("all"); setFilterRegion("all"); setFilterExp("all"); setMinScore(40); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline">
                      Clear all filters
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

            {scan.status === "done" && filteredJobs.length === 0 && scan.results.length > 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No jobs match current filters.{" "}
                <button onClick={() => { setFilterType("all"); setFilterRegion("all"); setFilterExp("all"); setMinScore(40); }} className="underline hover:text-foreground">Clear filters</button>
                {minScore > 0 && (
                  <span> or <button onClick={() => setMinScore(0)} className="underline hover:text-foreground">show all scores</button></span>
                )}
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
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${EXP_COLORS[job.experience_level] || EXP_COLORS["unknown"]}`}>
                          {EXP_LABELS[job.experience_level] || "Level ?"}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${JOB_TYPE_COLORS[job.job_type] || JOB_TYPE_COLORS["unknown"]}`}>
                          {job.job_type === "unknown" ? "type ?" : job.job_type}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                          {job.region || job.region_group}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${SOURCE_COLORS[job.source] || "bg-muted text-muted-foreground border-border"}`}>
                          {job.source}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{job.reason}</p>
                      <p className="text-xs text-muted-foreground/70 line-clamp-2">{job.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <a href={job.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> View</Button>
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
