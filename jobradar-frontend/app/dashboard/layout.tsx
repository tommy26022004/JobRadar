"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Briefcase, FileText, LogOut, Plus, Compass } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return null;

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
            <Link href="/discover" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Compass className="w-4 h-4" /> Discover
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
      <main className="p-6">{children}</main>
    </div>
  );
}
