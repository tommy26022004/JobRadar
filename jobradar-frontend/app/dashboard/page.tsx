"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { api, Application, Job, STATUSES, Status } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

const STATUS_LABELS: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer 🎉",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<Status, string> = {
  saved: "bg-zinc-100 text-zinc-700",
  applied: "bg-blue-100 text-blue-700",
  interview: "bg-yellow-100 text-yellow-700",
  offer: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

type AppWithJob = Application & { job?: Job };

export default function DashboardPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppWithJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.applications.list(), api.jobs.list()]).then(([applications, jobs]) => {
      const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));
      setApps(applications.map(a => ({ ...a, job: jobMap[a.job_id] })));
    }).catch(() => toast.error("Failed to load applications")).finally(() => setLoading(false));
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as Status;
    const appId = parseInt(result.draggableId);
    setApps(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus } : a));
    try {
      await api.applications.update(appId, { status: newStatus });
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const columns = STATUSES.map(status => ({
    status,
    apps: apps.filter(a => a.status === status),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Applications</h1>
        <p className="text-muted-foreground text-sm mt-1">{apps.length} jobs tracked</p>
      </div>

      {apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-muted-foreground mb-4">No jobs tracked yet.</p>
          <button onClick={() => router.push("/jobs/new")} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <Plus className="w-4 h-4" /> Add your first job
          </button>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {columns.map(({ status, apps: colApps }) => (
              <div key={status} className="flex flex-col gap-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{STATUS_LABELS[status]}</span>
                  <span className="text-xs text-muted-foreground">{colApps.length}</span>
                </div>
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-24 rounded-lg p-2 transition-colors ${snapshot.isDraggingOver ? "bg-zinc-200" : "bg-zinc-100"}`}
                    >
                      {colApps.map((app, index) => (
                        <Draggable key={app.id} draggableId={String(app.id)} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`mb-2 ${snapshot.isDragging ? "opacity-80" : ""}`}
                              onClick={() => router.push(`/jobs/${app.job_id}`)}
                            >
                              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                                <CardContent className="p-3 space-y-2">
                                  <p className="text-sm font-medium leading-tight">
                                    {app.job?.parsed_title || app.job?.title || "Untitled"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {app.job?.parsed_company || app.job?.company || "Unknown company"}
                                  </p>
                                  {app.match_score !== null && (
                                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[status]}`}>
                                      {app.match_score}% match
                                    </Badge>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
