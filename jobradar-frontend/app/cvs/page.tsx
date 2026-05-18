"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, CV } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, Loader2, Eye, EyeOff } from "lucide-react";

function CharCount({ value, max }: { value: string; max: number }) {
  const chars = value.length;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const pct = chars / max;
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
      <span>{words} words</span>
      <span className={pct > 0.9 ? "text-red-500 font-medium" : ""}>{chars.toLocaleString()} / {max.toLocaleString()}</span>
    </div>
  );
}

export default function CVsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [cvs, setCvs] = useState<CV[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    api.cvs.list().then(setCvs).catch(() => toast.error("Failed to load CVs")).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) return toast.error("Name and content required");
    setSaving(true);
    try {
      const cv = await api.cvs.create(newName.trim(), newContent.trim());
      setCvs(prev => [...prev, cv]);
      setNewName(""); setNewContent(""); setAdding(false);
      toast.success("CV added");
    } catch { toast.error("Failed to add CV"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    await api.cvs.delete(id);
    setCvs(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
    toast.success("CV deleted");
  };

  const handleRename = async (id: number) => {
    if (!editName.trim()) return;
    await api.cvs.update(id, { name: editName.trim() });
    setCvs(prev => prev.map(c => c.id === id ? { ...c, name: editName.trim() } : c));
    setEditingId(null);
    toast.success("CV renamed");
  };

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-lg tracking-tight">JobRadar</Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.full_name || user.email}</span>
          <Button variant="ghost" size="sm" onClick={logout}>Logout</Button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" /></Link>
            <h1 className="text-xl font-bold">My CVs</h1>
          </div>
          <Button size="sm" onClick={() => setAdding(true)} disabled={adding} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add CV
          </Button>
        </div>

        {adding && (
          <Card className="border-primary">
            <CardHeader><CardTitle className="text-base">New CV</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="cv-name">Name</Label>
                <Input id="cv-name" placeholder="e.g. Backend CV, Fullstack CV" value={newName} onChange={e => setNewName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-content">Paste CV content</Label>
                <Textarea id="cv-content" placeholder="Paste your full CV text here..." rows={10} value={newContent} onChange={e => setNewContent(e.target.value)} className="font-mono text-sm resize-none" maxLength={100000} />
                <CharCount value={newContent} max={100000} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={saving || !newName.trim() || !newContent.trim()} className="flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save CV"}
                </Button>
                <Button variant="outline" onClick={() => { setAdding(false); setNewName(""); setNewContent(""); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : cvs.length === 0 && !adding ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No CVs yet.</p>
            <button onClick={() => setAdding(true)} className="mt-2 text-sm text-primary hover:underline">Add your first CV →</button>
          </div>
        ) : (
          <div className="space-y-3">
            {cvs.map(cv => (
              <Card key={cv.id} className={previewId === cv.id ? "border-primary/50" : ""}>
                <CardContent className="p-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    {editingId === cv.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleRename(cv.id); if (e.key === "Escape") setEditingId(null); }} />
                        <button onClick={() => handleRename(cv.id)} className="p-1 hover:bg-muted rounded"><Check className="w-4 h-4 text-green-500" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4 text-muted-foreground" /></button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{cv.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cv.content.trim().split(/\s+/).length} words · {cv.content.length.toLocaleString()} chars · {new Date(cv.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {editingId !== cv.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setPreviewId(previewId === cv.id ? null : cv.id)}
                          className="p-1.5 hover:bg-muted rounded" title={previewId === cv.id ? "Hide preview" : "Preview"}>
                          {previewId === cv.id ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <button onClick={() => { setEditingId(cv.id); setEditName(cv.name); }} className="p-1.5 hover:bg-muted rounded">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => setDeletingId(cv.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Delete confirmation */}
                  {deletingId === cv.id && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-700 dark:text-red-400">Delete <span className="font-semibold">{cv.name}</span>?</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(cv.id)}>Delete</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Preview */}
                  {previewId === cv.id && (
                    <div className="border border-border rounded-lg p-3 bg-muted/30 max-h-60 overflow-y-auto">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{cv.content}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
