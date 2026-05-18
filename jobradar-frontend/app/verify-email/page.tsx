"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    // The backend redirects, so we just call the endpoint directly
    fetch(`${BASE}/auth/verify-email?token=${token}`, { redirect: "manual" })
      .then(res => {
        // 3xx = redirect = success, 200 also success
        if (res.status < 400) setStatus("success");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">JobRadar</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4 py-4">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Verifying your email...</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold text-lg">Email verified!</p>
              <p className="text-sm text-muted-foreground">Your account is now active. You can sign in.</p>
              <Link href="/login" className="block mt-2 text-sm font-medium text-primary hover:underline">
                Sign in →
              </Link>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 text-red-500 mx-auto" />
              <p className="font-semibold text-lg">Invalid link</p>
              <p className="text-sm text-muted-foreground">This verification link is invalid or has expired.</p>
              <Link href="/login" className="block mt-2 text-xs text-muted-foreground hover:underline">
                Back to login
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
