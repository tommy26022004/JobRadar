"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, CV } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

type StreamEvent =
  | { event: "start"; message: string }
  | { event: "parsed"; title: string; company: string; stack: string; salary: string }
  | { event: "matched"; score: number; analysis: string }
  | { event: "suggested"; suggestions: string }
  | { event: "done" }
  | { event: "saved"; job_id: number; application_id: number };

type Step = "idle" | "parsing" | "matching" | "suggesting" | "done";

export default function NewJobPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [cvs, setCvs] = useState<CV[]>([]);
  const [rawJd, setRawJd] = useState("");
  const [selectedCv, setSelectedCv] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [parsed, setParsed] = useState<{ title: string; company: string; stack: string; salary: string } | null>(null);
  const [matched, setMatched] = useState<{ score: number; analysis: string } | null>(null);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [savedJobId, setSavedJobId] = useState<number | null>(null);

  useEffect(() => {
    api.cvs.list().then(data => {
      setCvs(data);
      if (data.length > 0) setSelectedCv(data[0].id);
    });
  }, []);

  const handleAnalyze = async () => {
    if (!rawJd.trim()) return toast.error("Please paste a job description");
    if (!selectedCv) return toast.error("Please select a CV");

    setLoading(true);
    setStep("parsing");
    setParsed(null); setMatched(null); setSuggestions(null); setSavedJobId(null);

    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/analyze/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ raw_jd: rawJd, cv_id: selectedCv }),
      });

      if (!res.ok) throw new Error("Analysis failed");
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
            const evt: StreamEvent = JSON.parse(line.slice(5).trim());
            if (evt.event === "parsed") { setParsed(evt); setStep("matching"); }
            else if (evt.event === "matched") { setMatched(evt); setStep("suggesting"); }
            else if (evt.event === "suggested") { setSuggestions(evt.suggestions); }
            else if (evt.event === "saved") { setSavedJobId(evt.job_id); setStep("done"); }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { key: "parsing", label: "Parsing job description" },
    { key: "matching", label: "Matching with your CV" },
    { key: "suggesting", label: "Generating suggestions" },
    { key: "done", label: "Done" },
  ];
  const stepIndex = { idle: -1, parsing: 0, matching: 1, suggesting: 2, done: 3 };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="font-bold text-lg tracking-tight">JobRadar</Link>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" /></Link>
          <h1 className="text-xl font-bold">Add New Job</h1>
        </div>

        {step === "idle" && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="jd">Job Description</Label>
              <Textarea id="jd" placeholder="Paste the full job description here..." rows={12} value={rawJd} onChange={e => setRawJd(e.target.value)} className="font-mono text-sm resize-none" />
            </div>

            <div className="space-y-2">
              <Label>Select CV to match</Label>
              {cvs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No CVs yet. <Link href="/cvs" className="text-primary hover:underline">Add one first →</Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {cvs.map(cv => (
                    <button key={cv.id} onClick={() => setSelectedCv(cv.id)}
                      className={`px-4 py-2 rounded-full text-sm border transition-colors ${selectedCv === cv.id ? "bg-primary text-primary-foreground border-primary" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                      {cv.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleAnalyze} disabled={loading || !rawJd.trim() || !selectedCv} className="w-full" size="lg">
              Analyze with AI →
            </Button>
          </div>
        )}

        {step !== "idle" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                {steps.map((s, i) => {
                  const current = stepIndex[step];
                  const done = i < current || step === "done";
                  const active = i === current && step !== "done";
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      {done ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> :
                        active ? <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" /> :
                          <Circle className="w-5 h-5 text-zinc-300 shrink-0" />}
                      <span className={`text-sm ${active ? "font-medium" : done ? "text-muted-foreground" : "text-zinc-300"}`}>{s.label}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {parsed && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="font-semibold">{parsed.title} <span className="text-muted-foreground font-normal">@ {parsed.company}</span></p>
                  <p className="text-sm text-muted-foreground">💰 {parsed.salary}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {parsed.stack.split(",").map(s => s.trim()).filter(Boolean).map(skill => (
                      <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {matched && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Match Score</span>
                    <span className={`text-2xl font-bold ${matched.score >= 70 ? "text-green-600" : matched.score >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                      {matched.score}/100
                    </span>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${matched.score >= 70 ? "bg-green-500" : matched.score >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                      style={{ width: `${matched.score}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">{matched.analysis}</p>
                </CardContent>
              </Card>
            )}

            {suggestions && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="font-semibold">CV Suggestions</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{suggestions}</p>
                </CardContent>
              </Card>
            )}

            {step === "done" && savedJobId && (
              <div className="flex gap-3">
                <Button onClick={() => router.push(`/jobs/${savedJobId}`)} className="flex-1">View Job Detail</Button>
                <Button variant="outline" onClick={() => router.push("/dashboard")} className="flex-1">Back to Dashboard</Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
