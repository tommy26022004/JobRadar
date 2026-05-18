"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Briefcase, FileText, LogOut, Plus, Compass, Settings, Moon, Sun } from "lucide-react";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="w-4 h-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute w-4 h-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-card px-6 py-3 flex items-center justify-between">
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
            <Link href="/settings" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Settings className="w-4 h-4" /> Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/jobs/new">
            <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Add Job</Button>
          </Link>
          <span className="text-sm text-muted-foreground">{user.full_name || user.email}</span>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden p-6">{children}</main>
    </div>
  );
}
