"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, FileText, LogOut, Plus, ExternalLink, Trash2, Check } from "lucide-react";

type Provider = {
  name: string;
  models: string[];
  default_model: string;
  key_url: string;
  free: boolean;
};

type AISettings = {
  provider: string;
  model: string | null;
  has_custom_key: boolean;
  key_preview: string | null;
};

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export default function SettingsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [current, setCurrent] = useState<AISettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("groq");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("access_token");
    const h = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${BASE}/settings/ai/providers`, { headers: h }).then(r => r.json()),
      fetch(`${BASE}/settings/ai`, { headers: h }).then(r => r.json()),
      fetch(`${BASE}/settings/notifications`, { headers: h }).then(r => r.json()),
    ]).then(([provs, curr, notif]) => {
      setProviders(provs);
      setCurrent(curr);
      setSelectedProvider(curr.provider || "groq");
      setSelectedModel(curr.model || provs[curr.provider]?.default_model || "");
      setEmailNotifications(notif.email_notifications ?? true);
    });
  }, [user]);

  useEffect(() => {
    if (providers[selectedProvider]) {
      setSelectedModel(providers[selectedProvider].default_model);
    }
  }, [selectedProvider, providers]);

  const handleSave = async () => {
    if (!apiKey.trim()) return toast.error("Please enter your API key");
    setSaving(true);
    try {
      const token = localStorage.getItem("access_token");
      const r = await fetch(`${BASE}/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: selectedProvider, api_key: apiKey, model: selectedModel }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      toast.success("AI settings saved");
      setApiKey("");
      // Refresh current settings
      const curr = await fetch(`${BASE}/settings/ai`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      setCurrent(curr);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    const token = localStorage.getItem("access_token");
    await fetch(`${BASE}/settings/ai`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    toast.success("Reverted to server default (Groq)");
    setCurrent(prev => prev ? { ...prev, has_custom_key: false, key_preview: null, provider: "groq" } : prev);
  };

  const handleToggleNotifications = async (enabled: boolean) => {
    setEmailNotifications(enabled);
    setSavingNotif(true);
    try {
      const token = localStorage.getItem("access_token");
      await fetch(`${BASE}/settings/notifications`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email_notifications: enabled }),
      });
      toast.success(enabled ? "Email notifications enabled" : "Email notifications disabled");
    } catch {
      toast.error("Failed to update notification settings");
      setEmailNotifications(!enabled);
    } finally {
      setSavingNotif(false);
    }
  };

  if (authLoading || !user) return null;

  const activeProvider = providers[selectedProvider];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
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

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" /></Link>
          <div>
            <h1 className="text-xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">Configure your AI provider for job matching</p>
          </div>
        </div>

        {/* Current status */}
        {current && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current AI Provider</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {providers[current.provider]?.name || current.provider}
                      </span>
                      {current.has_custom_key ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50">
                          <Check className="w-3 h-3 mr-1" /> Your key {current.key_preview}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-zinc-500">
                          Server default key
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Model: {current.model || providers[current.provider]?.default_model || "—"}
                    </p>
                  </div>
                </div>
                {current.has_custom_key && (
                  <Button variant="ghost" size="sm" onClick={handleClear} className="text-red-500 hover:text-red-600 gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Remove key
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Provider picker */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Switch AI Provider</p>

            <div className="grid grid-cols-3 gap-2">
              {Object.entries(providers).map(([key, p]) => (
                <button key={key} onClick={() => setSelectedProvider(key)}
                  className={`p-3 rounded-lg border text-left transition-colors ${selectedProvider === key ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground"}`}>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="flex items-center gap-1 mt-1">
                    {p.free
                      ? <span className="text-xs text-green-600 font-medium">Free tier</span>
                      : <span className="text-xs text-amber-600 font-medium">Paid</span>}
                  </div>
                </button>
              ))}
            </div>

            {activeProvider && (
              <>
                {/* Model selector */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</p>
                  <div className="flex flex-wrap gap-2">
                    {activeProvider.models.map(m => (
                      <button key={m} onClick={() => setSelectedModel(m)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${selectedModel === m ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-muted-foreground"}`}>
                        {m}
                        {m === activeProvider.default_model && (
                          <span className="ml-1 text-zinc-400">(default)</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* API Key input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {activeProvider.name} API Key
                    </p>
                    <a href={activeProvider.key_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline">
                      Get free key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <Input
                    type="password"
                    placeholder={`Paste your ${activeProvider.name} API key here`}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your key is stored securely and only used for your account's job matching.
                    {activeProvider.free && " Free tier available — no credit card needed."}
                  </p>
                </div>

                <Button onClick={handleSave} disabled={saving || !apiKey.trim()} className="w-full">
                  {saving ? "Saving..." : `Save ${activeProvider.name} Key`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notifications</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email alerts for strong matches</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get emailed when JobRadar finds jobs with score ≥75% during auto-scan.
                  {" "}Sent to <span className="font-medium">{user.email}</span>.
                </p>
              </div>
              <button
                disabled={savingNotif}
                onClick={() => handleToggleNotifications(!emailNotifications)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${emailNotifications ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-zinc-200 shadow transition duration-200 ${emailNotifications ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            {!emailNotifications && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                Notifications off — you won't receive match alerts by email.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick guide */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Guide</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <span className="text-green-600 font-medium w-20 shrink-0">Groq</span>
                <span>Best choice — free, fast, no credit card. Up to 6,000 req/day. Get key at console.groq.com</span>
              </div>
              <div className="flex gap-2">
                <span className="text-blue-600 font-medium w-20 shrink-0">Gemini</span>
                <span>Google AI — free tier available. Good fallback when Groq is rate limited.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-amber-600 font-medium w-20 shrink-0">OpenAI</span>
                <span>Paid — gpt-4o-mini is cheapest (~$0.0001/job scan). Best accuracy.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
