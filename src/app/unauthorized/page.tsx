import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg font-semibold">Access Denied</CardTitle>
          <CardDescription className="text-sm text-zinc-500">
            You do not have permission to view this resource.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Back to Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
