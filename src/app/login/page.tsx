"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result) {
        setError("Login failed. Please check your network connection and try again.");
        return;
      }

      if (result.error) {
        if (result.error === "fetch failed" || result.error.includes("fetch")) {
          setError("Unable to connect to the server. Please check your internet connection or disable any VPN/proxy and try again.");
        } else if (result.error === "Configuration" || result.error.includes("Configuration")) {
          setError("The server is not configured correctly. Please contact your administrator.");
        } else {
          setError("Invalid email or password.");
        }
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("fetch") || message.includes("network") || message.includes("proxy")) {
        setError("Unable to reach the server. Please check your internet connection or disable any VPN/proxy and try again.");
      } else if (message.includes("timeout") || message.includes("abort")) {
        setError("The request timed out. Please try again.");
      } else {
        setError("An unexpected error occurred. Please try again or contact your administrator.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-1 shadow-sm overflow-hidden">
            <img src={withBasePath("/saes-logo.jpg")} alt="SAEC Logo" className="h-full w-full rounded-xl object-cover" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">Welcome to SAEC ERP</CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Sign in with your organization account to continue
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {registered && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Registration submitted! An administrator will review and approve your request.
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@saec.com"
                required
                autoComplete="username"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="h-11"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="font-medium text-teal-600 hover:underline"
              >
                Register here
              </button>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Contact your administrator if you need access
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
