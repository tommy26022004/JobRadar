const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  auth: {
    register: (email: string, password: string, full_name?: string) =>
      request<{ access_token: string; refresh_token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name }),
      }),
    login: (email: string, password: string) =>
      request<{ access_token: string; refresh_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ id: number; email: string; full_name: string }>("/auth/me"),
  },
  cvs: {
    list: () => request<CV[]>("/cvs/"),
    create: (name: string, content: string) =>
      request<CV>("/cvs/", { method: "POST", body: JSON.stringify({ name, content }) }),
    update: (id: number, data: Partial<CV>) =>
      request<CV>(`/cvs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/cvs/${id}`, { method: "DELETE" }),
  },
  jobs: {
    list: () => request<Job[]>("/jobs/"),
    get: (id: number) => request<Job>(`/jobs/${id}`),
    delete: (id: number) => request<void>(`/jobs/${id}`, { method: "DELETE" }),
  },
  applications: {
    list: () => request<Application[]>("/applications/"),
    get: (id: number) => request<Application>(`/applications/${id}`),
    update: (id: number, data: Partial<Application>) =>
      request<Application>(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/applications/${id}`, { method: "DELETE" }),
  },
};

export type CV = {
  id: number;
  name: string;
  content: string;
  created_at: string;
};

export type Job = {
  id: number;
  title: string | null;
  company: string | null;
  raw_jd: string;
  parsed_title: string | null;
  parsed_company: string | null;
  parsed_stack: string | null;
  parsed_requirements: string | null;
  parsed_salary: string | null;
  created_at: string;
};

export type Application = {
  id: number;
  job_id: number;
  cv_id: number | null;
  status: "saved" | "applied" | "interview" | "offer" | "rejected";
  match_score: number | null;
  ai_analysis: string | null;
  cv_suggestions: string | null;
  interview_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export const STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type Status = typeof STATUSES[number];
