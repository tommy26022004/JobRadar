"use client";
import { useEffect, useRef, useState } from "react";
import { useScan } from "@/lib/scan-context";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import Link from "next/link";

export function ScanToast() {
  const { autoScan } = useScan();
  const [dismissed, setDismissed] = useState(false);
  const prevStatusRef = useRef(autoScan.status);

  useEffect(() => {
    if (autoScan.status === "running" && prevStatusRef.current !== "running") {
      setDismissed(false);
    }
    prevStatusRef.current = autoScan.status;
  }, [autoScan.status]);

  const visible =
    !dismissed &&
    (autoScan.status === "running" || autoScan.status === "done" || autoScan.status === "error");

  if (!visible) return null;

  const pct = autoScan.total > 0 ? Math.min((autoScan.matched / autoScan.total) * 100, 100) : 0;
  const newMatches = autoScan.results.filter(j => j.score >= 50).length;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-72 rounded-xl border bg-white shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="h-1 w-full bg-zinc-100">
        <div
          className={`h-1 transition-all duration-500 ${autoScan.status === "done" ? "bg-green-500" : autoScan.status === "error" ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${autoScan.status === "running" && autoScan.total === 0 ? 8 : pct}%` }}
        />
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {autoScan.status === "running" && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary" />}
            {autoScan.status === "done" && <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" />}
            {autoScan.status === "error" && <XCircle className="w-4 h-4 shrink-0 text-red-500" />}
            <span className="text-sm font-medium leading-tight">
              {autoScan.status === "running" ? "Finding new jobs…" : autoScan.status === "done" ? "Feed updated" : "Scan failed"}
            </span>
          </div>
          {(autoScan.status === "done" || autoScan.status === "error") && (
            <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{autoScan.message}</p>

        {autoScan.status === "done" && newMatches > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-green-600 font-medium">+{newMatches} new matches added to feed</span>
          </div>
        )}

        <Link href="/dashboard" className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline font-medium">
          {autoScan.status === "done" ? "View in dashboard →" : "Go to dashboard →"}
        </Link>
      </div>
    </div>
  );
}
