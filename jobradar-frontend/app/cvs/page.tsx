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
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, Loader2 } from "lucide-react";

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
    if (!confirm("Delete this CV?")) return;
    await api.cvs.delete(id);
    setCvs(prev => prev.filter(c => c.id !== id));
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
                <Input id="cv-name" placeholder="e.g. Backend CV, Fullstack CV" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-content">Paste CV content</Label>
                <Textarea id="cv-content" placeholder="Paste your full CV text here..." rows={10} value={newContent} onChange={e => setNewContent(e.target.value)} className="font-mono text-sm resize-none" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={saving} className="flex-1">
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
              <Card key={cv.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  {editingId === cv.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" autoFocus />
                      <button onClick={() => handleRename(cv.id)}><Check className="w-4 h-4 text-green-500" /></button>
                      <button onClick={() => setEditingId(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{cv.name}</p>
                        <p className="text-xs text-muted-foreground">{cv.content.length} chars · {new Date(cv.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setEditingId(cv.id); setEditName(cv.name); }} className="p-1.5 hover:bg-muted rounded">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(cv.id)} className="p-1.5 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </>
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
