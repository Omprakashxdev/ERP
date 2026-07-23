"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ContractorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Contractors page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-7xl py-12">
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-12 w-12 text-red-300" />
          <h3 className="mt-4 text-lg font-medium">Something went wrong</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            {error.message ?? "Failed to load Contractors."}
          </p>
          <Button className="mt-4" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
