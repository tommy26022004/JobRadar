"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export type DiscoveredJob = {
  id: string; title: string; company: string; url: string;
  region: string; region_group: string; job_type: string;
  experience_level: string; score: number; reason: string;
  description: string; source: string; is_new?: boolean;
};

export type ScanState = {
  scan_id: string | null;
  status: "idle" | "running" | "done" | "error";
  total: number; matched: number; message: string;
  results: DiscoveredJob[];
};

export type FeedState = {
  jobs: DiscoveredJob[];
  total_today: number;
  new_count: number;
  last_scan_at: string | null;
  next_scan_in_minutes: number | null;
};

type ScanContextType = {
  // hard scan — used by Discover page
  hardScan: ScanState;
  setHardScan: (s: ScanState | ((prev: ScanState) => ScanState)) => void;
  startHardScanPolling: (scan_id: string) => void;
  // auto scan — background only, shown in ScanToast
  autoScan: ScanState;
  autoScanStatus: "idle" | "scanning" | "cached" | "no_cv" | "done";
  // feed — accumulated daily matches
  feed: FeedState;
  refreshFeed: () => void;
};

const IDLE: ScanState = { scan_id: null, status: "idle", total: 0, matched: 0, message: "", results: [] };
const EMPTY_FEED: FeedState = { jobs: [], total_today: 0, new_count: 0, last_scan_at: null, next_scan_in_minutes: null };

const ScanContext = createContext<ScanContextType | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [hardScan, setHardScan] = useState<ScanState>(IDLE);
  const [autoScan, setAutoScan] = useState<ScanState>(IDLE);
  const [autoScanStatus, setAutoScanStatus] = useState<"idle" | "scanning" | "cached" | "no_cv" | "done">("idle");
  const [feed, setFeed] = useState<FeedState>(EMPTY_FEED);
  const hardPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initDoneRef = useRef(false);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

  const stopHardPoll = useCallback(() => {
    if (hardPollRef.current) { clearInterval(hardPollRef.current); hardPollRef.current = null; }
  }, []);

  const stopAutoPoll = useCallback(() => {
    if (autoPollRef.current) { clearInterval(autoPollRef.current); autoPollRef.current = null; }
  }, []);

  const startHardScanPolling = useCallback((scan_id: string) => {
    stopHardPoll();
    hardPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/discover/status/${scan_id}`, { headers: authHeader() });
        if (!r.ok) return;
        const data = await r.json();
        setHardScan({ scan_id, status: data.status, total: data.total, matched: data.matched, message: data.message, results: data.results });
        if (data.status === "done" || data.status === "error") stopHardPoll();
      } catch { /* keep polling */ }
    }, 2000);
  }, [stopHardPoll]);

  const startAutoScanPolling = useCallback((scan_id: string) => {
    stopAutoPoll();
    autoPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/discover/status/${scan_id}`, { headers: authHeader() });
        if (!r.ok) return;
        const data = await r.json();
        setAutoScan({ scan_id, status: data.status, total: data.total, matched: data.matched, message: data.message, results: data.results });
        if (data.status === "done" || data.status === "error") {
          stopAutoPoll();
          setAutoScanStatus("done");
          fetch(`${BASE}/discover/feed`, { headers: authHeader() })
            .then(r => r.json()).then(setFeed).catch(() => {});
        }
      } catch { /* keep polling */ }
    }, 2000);
  }, [stopAutoPoll]);

  const refreshFeed = useCallback(() => {
    if (!user) return;
    fetch(`${BASE}/discover/feed`, { headers: authHeader() })
      .then(r => r.json()).then(setFeed).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || initDoneRef.current) return;
    initDoneRef.current = true;

    const h = authHeader();

    // Restore hard scan if it was running (user navigated away mid-scan)
    fetch(`${BASE}/discover/latest`, { headers: h })
      .then(r => r.json())
      .then(data => {
        if (data.scan_id && data.status === "running") {
          // Check if this is a hard scan (message contains "deep" or limit was high)
          setHardScan({ scan_id: data.scan_id, status: "running", total: data.total, matched: data.matched, message: data.message, results: data.results });
          startHardScanPolling(data.scan_id);
          return;
        }
        // Trigger auto-scan check (backend enforces cooldown)
        fetch(`${BASE}/discover/auto`, { method: "POST", headers: h })
          .then(r => r.json())
          .then(data => {
            if (data.status === "scanning" && data.scan_id) {
              setAutoScanStatus("scanning");
              setAutoScan(prev => ({ ...prev, status: "running", message: "Checking for new jobs..." }));
              startAutoScanPolling(data.scan_id);
            } else if (data.status === "cached") {
              setAutoScanStatus("cached");
            } else if (data.status === "no_cv") {
              setAutoScanStatus("no_cv");
            }
          }).catch(() => {});
      }).catch(() => {});

    fetch(`${BASE}/discover/feed`, { headers: h })
      .then(r => r.json()).then(setFeed).catch(() => {});
  }, [user, startHardScanPolling, startAutoScanPolling]);

  useEffect(() => () => { stopHardPoll(); stopAutoPoll(); }, [stopHardPoll, stopAutoPoll]);

  return (
    <ScanContext.Provider value={{ hardScan, setHardScan, startHardScanPolling, autoScan, autoScanStatus, feed, refreshFeed }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used inside ScanProvider");
  return ctx;
}
