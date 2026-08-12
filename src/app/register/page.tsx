"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, UserPlus } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { submitRegistration, getRegionsForForm, getStaffForForm } from "@/lib/actions/user-management";
import { toast } from "sonner";

interface RegionOption {
  id: string;
  name: string;
}

interface StaffOption {
  id: string;
  name: string;
  designation: string | null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [regionId, setRegionId] = useState("");
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    async function loadFormData() {
      try {
        const [regionsRes, staffRes] = await Promise.all([
          getRegionsForForm(),
          getStaffForForm(),
        ]);
        if (regionsRes.success && regionsRes.data) {
          setRegions(regionsRes.data as RegionOption[]);
        }
        if (staffRes.success && staffRes.data) {
          setStaff(staffRes.data as StaffOption[]);
        }
      } catch {
        // Form data is optional — registration can still work without it
      } finally {
        setDataLoading(false);
      }
    }
    loadFormData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await submitRegistration({
        name,
        email,
        password,
        employeeCode: employeeCode || undefined,
        designation: designation || undefined,
        regionId: regionId || undefined,
        reportingManagerId: reportingManagerId || undefined,
      });

      if (res.success) {
        toast.success("Registration submitted! An administrator will review your request.");
        router.push("/login?registered=true");
      } else {
        setError(res.error ?? "Failed to submit registration.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-1 shadow-sm overflow-hidden">
            <img src={withBasePath("/saes-logo.jpg")} alt="SAEC Logo" className="h-full w-full rounded-xl object-cover" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">Register New Account</CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Fill in your details. An administrator will review and approve your request.
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Full Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="employeeCode" className="text-sm font-medium">Employee Code</Label>
                <Input
                  id="employeeCode"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation" className="text-sm font-medium">Designation</Label>
                <Input
                  id="designation"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Region</Label>
                {dataLoading ? (
                  <div className="flex h-11 items-center px-3">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  </div>
                ) : (
                  <Select value={regionId} onValueChange={(v) => setRegionId(v ?? "")}>
                    <SelectTrigger className="w-full h-11">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reporting Manager</Label>
                {dataLoading ? (
                  <div className="flex h-11 items-center px-3">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  </div>
                ) : (
                  <Select value={reportingManagerId} onValueChange={(v) => setReportingManagerId(v ?? "")}>
                    <SelectTrigger className="w-full h-11">
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.designation ? ` (${s.designation})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Submit Registration
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-medium text-teal-600 hover:underline"
              >
                Sign in
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
