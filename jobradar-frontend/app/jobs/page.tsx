"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Job, Application, Status, STATUSES } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, Search, ExternalLink, Trash2, ChevronRight } from "lucide-react";

type AppWithJob = Application & { job?: Job };

const STATUS_LABELS: Record<Status, string> = {
  saved: "Saved", applied: "Applied", interview: "Interview", offer: "Offer 🎉", rejected: "Rejected",
};
const STATUS_COLORS: Record<Status, string> = {
  saved: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  interview: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  offer: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300",
};

export default function JobsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.applications.list(), api.jobs.list()]).then(([applications, jobs]) => {
      const jobMap = Object.fromEntries(jobs.map((j: Job) => [j.id, j]));
      setApps(applications.map((a: Application) => ({ ...a, job: jobMap[a.job_id] })));
    }).catch(() => toast.error("Failed to load jobs")).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (jobId: number, appId: number) => {
    try {
      await api.applications.delete(appId);
      await api.jobs.delete(jobId);
      setApps(prev => prev.filter(a => a.id !== appId));
      setDeletingId(null);
      toast.success("Job removed");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const filtered = useMemo(() => {
    return apps.filter(a => {
      const title = (a.job?.parsed_title || a.job?.title || "").toLowerCase();
      const company = (a.job?.parsed_company || a.job?.company || "").toLowerCase();
      const q = search.toLowerCase();
      if (q && !title.includes(q) && !company.includes(q)) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      return true;
    });
  }, [apps, search, filterStatus]);

  const byStatus = Object.fromEntries(STATUSES.map(s => [s, apps.filter(a => a.status === s).length])) as Record<Status, number>;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header + search */}
      <div className="shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">All Jobs</h1>
            <p className="text-xs text-muted-foreground">{apps.length} tracked · {byStatus.interview} interviews · {byStatus.offer} offers</p>
          </div>
          <Link href="/jobs/new"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Add Job
          </Link>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", ...STATUSES] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? `All (${apps.length})` : `${STATUS_LABELS[s]} (${byStatus[s]})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by title or company..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm" />
        </div>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            {apps.length === 0 ? (
              <>
                <p className="text-muted-foreground text-sm mb-3">No jobs tracked yet</p>
                <Link href="/jobs/new" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <Plus className="w-4 h-4" /> Add your first job
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No jobs match your filters</p>
            )}
          </div>
        ) : (
          filtered.map(app => {
            const job = app.job;
            const skills = job?.parsed_stack?.split(",").map(s => s.trim()).filter(Boolean).slice(0, 4) || [];
            return (
              <Card key={app.id} className="group hover:shadow-md transition-shadow border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Score */}
                    {app.match_score !== null && (
                      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${app.match_score >= 75 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : app.match_score >= 55 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"}`}>
                        {app.match_score}%
                      </div>
                    )}

                    {/* Main info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/jobs/${app.job_id}`)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">{job?.parsed_title || job?.title || "Untitled"}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[app.status as Status]}`}>
                          {STATUS_LABELS[app.status as Status]}
                        </span>
                        {app.interview_at && new Date(app.interview_at) > new Date() && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 font-medium">
                            📅 {new Date(app.interview_at).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{job?.parsed_company || job?.company || "—"}</p>
                      {job?.parsed_salary && <p className="text-xs text-muted-foreground">💰 {job.parsed_salary}</p>}
                      {skills.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1.5">
                          {skills.map(s => (
                            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setDeletingId(app.id)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                      <button onClick={() => router.push(`/jobs/${app.job_id}`)}
                        className="p-1.5 rounded hover:bg-muted transition-colors">
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Delete confirm */}
                  {deletingId === app.id && (
                    <div className="mt-3 flex items-center justify-between gap-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-700 dark:text-red-400">Remove <span className="font-semibold">{job?.parsed_title || "this job"}</span>?</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleDelete(app.job_id, app.id)}
                          className="text-xs px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600 font-medium">Delete</button>
                        <button onClick={() => setDeletingId(null)}
                          className="text-xs px-2.5 py-1 rounded border border-border hover:bg-muted">Cancel</button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
