"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Job, Application, Status, STATUSES } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2, Calendar, Save } from "lucide-react";

const STATUS_LABELS: Record<Status, string> = {
  saved: "Saved", applied: "Applied", interview: "Interview", offer: "Offer 🎉", rejected: "Rejected",
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.jobs.get(Number(id)), api.applications.list()]).then(([j, apps]) => {
      setJob(j);
      const found = apps.find(a => a.job_id === j.id) || null;
      setApp(found);
      if (found) {
        setNotes(found.notes || "");
        setInterviewAt(found.interview_at ? found.interview_at.slice(0, 16) : "");
      }
    }).catch(() => toast.error("Failed to load job")).finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async (status: Status) => {
    if (!app) return;
    setApp(prev => prev ? { ...prev, status } : prev);
    await api.applications.update(app.id, { status });
    toast.success("Status updated");
  };

  const saveNotes = useCallback(async () => {
    if (!app) return;
    setSaving(true);
    try {
      const updated = await api.applications.update(app.id, {
        notes: notes || null,
        interview_at: interviewAt ? new Date(interviewAt).toISOString() : null,
      });
      setApp(updated);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [app, notes, interviewAt]);

  const deleteJob = async () => {
    if (!confirm("Delete this job?")) return;
    await api.jobs.delete(Number(id));
    router.push("/dashboard");
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!job) return null;

  const skills = job.parsed_stack?.split(",").map(s => s.trim()).filter(Boolean) || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="font-bold text-lg tracking-tight">JobRadar</Link>
      </header>
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" /></Link>
            <div>
              <h1 className="text-2xl font-bold">{job.parsed_title || job.title || "Untitled"}</h1>
              <p className="text-muted-foreground">{job.parsed_company || job.company || "Unknown company"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={deleteJob} className="text-red-500 hover:text-red-600 hover:bg-red-50">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {app && (
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(s => (
              <button key={s} onClick={() => updateStatus(s)}
                className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${app.status === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:border-muted-foreground"}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Job Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {job.parsed_salary && <p className="text-sm">💰 <span className="font-medium">{job.parsed_salary}</span></p>}
                {skills.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Tech Stack</p>
                    <div className="flex flex-wrap gap-1">
                      {skills.map(skill => <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>)}
                    </div>
                  </div>
                )}
                {job.parsed_requirements && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Requirements</p>
                    <p className="text-sm whitespace-pre-wrap">{job.parsed_requirements}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Interview date + notes */}
            {app && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4" /> Interview & Notes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Interview Date</label>
                    <input
                      type="datetime-local"
                      value={interviewAt}
                      onChange={e => setInterviewAt(e.target.value)}
                      className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {interviewAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(interviewAt).toLocaleString("vi-VN", { dateStyle: "full", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Ghi chú về công ty, recruiter, yêu cầu riêng..."
                      rows={4}
                      className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  </div>
                  <Button size="sm" onClick={saveNotes} disabled={saving} className="gap-1.5 w-full">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {app?.match_score !== null && app?.match_score !== undefined && (
              <Card>
                <CardHeader><CardTitle className="text-base">Match Score</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-3xl font-bold ${app.match_score >= 70 ? "text-green-600" : app.match_score >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                      {app.match_score}/100
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className={`h-2 rounded-full ${app.match_score >= 70 ? "bg-green-500" : app.match_score >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                      style={{ width: `${app.match_score}%` }} />
                  </div>
                  {app.ai_analysis && <p className="text-sm text-muted-foreground">{app.ai_analysis}</p>}
                </CardContent>
              </Card>
            )}

            {app?.cv_suggestions && (
              <Card>
                <CardHeader><CardTitle className="text-base">CV Suggestions</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{app.cv_suggestions}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
