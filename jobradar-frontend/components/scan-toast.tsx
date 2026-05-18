"use client";
import { useEffect, useRef, useState } from "react";
import { useScan } from "@/lib/scan-context";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import Link from "next/link";

export function ScanToast() {
  const { autoScan, hardScan } = useScan();
  const [autoDismissed, setAutoDismissed] = useState(false);
  const [hardDismissed, setHardDismissed] = useState(false);
  const prevAutoStatus = useRef(autoScan.status);
  const prevHardStatus = useRef(hardScan.status);

  useEffect(() => {
    if (autoScan.status === "running" && prevAutoStatus.current !== "running") setAutoDismissed(false);
    prevAutoStatus.current = autoScan.status;
  }, [autoScan.status]);

  useEffect(() => {
    if (hardScan.status === "running" && prevHardStatus.current !== "running") setHardDismissed(false);
    prevHardStatus.current = hardScan.status;
  }, [hardScan.status]);

  // hardScan takes priority when it's active
  const useHard = !hardDismissed && (hardScan.status === "running" || hardScan.status === "done" || hardScan.status === "error");
  const useAuto = !autoDismissed && (autoScan.status === "running" || autoScan.status === "done" || autoScan.status === "error");

  const scan = useHard ? hardScan : useAuto ? autoScan : null;
  const isHard = useHard;

  if (!scan) return null;

  const pct = scan.total > 0 ? Math.min((scan.matched / scan.total) * 100, 100) : 0;
  const newMatches = scan.results.filter(j => j.score >= 50).length;
  const dismiss = () => isHard ? setHardDismissed(true) : setAutoDismissed(true);

  const steps = [
    { label: "Fetching jobs", done: scan.total > 0 || scan.status === "done" },
    { label: "Filtering by CV", done: scan.total > 0 || scan.status === "done" },
    { label: scan.total > 0 ? `Analyzing ${scan.matched} / ${scan.total}` : "Analyzing…", done: scan.status === "done" },
  ];

  return (
    <div className="fixed bottom-5 right-5 z-50 w-72 rounded-xl border bg-white shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Top progress bar */}
      <div className="h-0.5 w-full bg-zinc-100">
        <div
          className={`h-0.5 transition-all duration-700 ease-out ${
            scan.status === "done" ? "bg-green-500" : scan.status === "error" ? "bg-red-500" : "bg-primary"
          }`}
          style={{ width: `${scan.status === "running" && scan.total === 0 ? 12 : scan.status === "done" ? 100 : pct}%` }}
        />
      </div>

      <div className="p-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            {scan.status === "running" && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" />}
            {scan.status === "done" && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-500" />}
            {scan.status === "error" && <XCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />}
            <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              {scan.status === "running"
                ? isHard ? "Scanning jobs" : "Auto scan"
                : scan.status === "done" ? "Scan complete" : "Scan failed"}
            </span>
          </div>
          {(scan.status === "done" || scan.status === "error") && (
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0 -mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Step list — only while running */}
        {scan.status === "running" && (
          <div className="space-y-1.5 mb-2.5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300 ${
                  step.done ? "bg-green-500" :
                  i === steps.findIndex(s => !s.done) ? "bg-primary animate-pulse" :
                  "bg-zinc-200"
                }`} />
                <span className={`text-xs transition-colors duration-300 ${
                  step.done ? "text-muted-foreground line-through" :
                  i === steps.findIndex(s => !s.done) ? "text-foreground font-medium" :
                  "text-muted-foreground"
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Done summary */}
        {scan.status === "done" && newMatches > 0 && (
          <p className="text-xs text-green-600 font-medium mb-2">
            {isHard ? `${newMatches} matches found` : `+${newMatches} new matches in feed`}
          </p>
        )}
        {scan.status === "done" && newMatches === 0 && (
          <p className="text-xs text-muted-foreground mb-2">No strong matches this time</p>
        )}

        {/* Error */}
        {scan.status === "error" && (
          <p className="text-xs text-red-500 mb-2 line-clamp-2">{scan.message}</p>
        )}

        <Link
          href={isHard ? "/discover" : "/dashboard"}
          className="text-xs text-primary hover:underline font-medium"
        >
          {scan.status === "done"
            ? isHard ? "View results →" : "View in dashboard →"
            : isHard ? "Back to Discover →" : "Go to dashboard →"}
        </Link>
      </div>
    </div>
  );
}
