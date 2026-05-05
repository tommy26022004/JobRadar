"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, CV } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ExternalLink, Plus, ArrowLeft, Briefcase, FileText, LogOut } from "lucide-react";

type DiscoveredJob = {
  id: string;
  title: string;
  company: string;
  url: string;
  region: string;
  score: number;
  reason: string;
  description: string;
};

const CATEGORIES = [
  { key: "programming", label: "Programming" },
  { key: "devops", label: "DevOps" },
  { key: "design", label: "Design" },
  { key: "all", label: "All Remote" },
];

export default function DiscoverPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [cvs, setCvs] = useState<CV[]>([]);
  const [selectedCv, setSelectedCv] = useState<number>(0);
  const [category, setCategory] = useState("programming");
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ matched: 0, total: 0, message: "" });
  const [tracking, setTracking] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    api.cvs.list().then(data => {
      setCvs(data);
      if (data.length > 0) setSelectedCv(data[0].id);
    });
  }, []);

  const handleDiscover = async () => {
    if (!selectedCv) return toast.error("Please add a CV first");
    setJobs([]);
    setStatus("running");
    setProgress({ matched: 0, total: 0, message: "Starting..." });

    const token = localStorage.getItem("access_token");
    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/discover/?category=${category}&limit=20&cv_id=${selectedCv}`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
              setJobs(prev => {
                const updated = [...prev, evt.job].sort((a, b) => b.score - a.score);
                return updated;
              });
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
      const newJob = await api.jobs.list().then(() =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/jobs/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: JSON.stringify({ raw_jd: job.description, title: job.title, company: job.company }),
        }).then(r => r.json())
      );
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/applications/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify({ job_id: newJob.id, cv_id: selectedCv }),
      });
      toast.success(`"${job.title}" added to your tracker`);
    } catch {
      toast.error("Failed to track job");
      setTracking(prev => { const s = new Set(prev); s.delete(job.id); return s; });
    }
  };

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
            <p className="text-sm text-muted-foreground">AI matches WeWorkRemotely jobs with your CV automatically</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Category</p>
            <div className="flex gap-2">
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${category === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {cvs.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Match with CV</p>
              <div className="flex gap-2">
                {cvs.map(cv => (
                  <button key={cv.id} onClick={() => setSelectedCv(cv.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedCv === cv.id ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                    {cv.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleDiscover} disabled={status === "running" || !selectedCv} className="gap-2">
            {status === "running" ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</> : "Find Matching Jobs"}
          </Button>
        </div>

        {status === "running" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progress.message}</span>
              {progress.total > 0 && (
                <span className="text-muted-foreground">{progress.matched}/{progress.total} analyzed</span>
              )}
            </div>
            {progress.total > 0 && (
              <div className="w-full bg-zinc-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(progress.matched / progress.total) * 100}%` }} />
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

        {jobs.length > 0 && (
          <div className="space-y-3">
            {status === "done" && (
              <p className="text-sm text-muted-foreground">{jobs.length} jobs ranked by match score</p>
            )}
            {jobs.map(job => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-lg font-bold ${job.score >= 70 ? "text-green-600" : job.score >= 50 ? "text-yellow-600" : "text-zinc-500"}`}>
                          {job.score}%
                        </span>
                        <h3 className="font-semibold text-sm">{job.title}</h3>
                        <Badge variant="outline" className="text-xs">{job.company}</Badge>
                        <Badge variant="secondary" className="text-xs">{job.region}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{job.reason}</p>
                      <p className="text-xs text-zinc-400 line-clamp-2">{job.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
