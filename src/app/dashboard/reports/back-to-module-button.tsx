"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackToModuleButton({
  returnTo,
  label,
}: {
  returnTo: string;
  label: string;
}) {
  const router = useRouter();

  const handleBack = () => {
    // If the user has history in the current tab session, navigate back cleanly
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(returnTo);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleBack}
      className="gap-2 border-zinc-300 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 shadow-sm transition-colors"
    >
      <ArrowLeft className="h-4 w-4 text-zinc-600" />
      <span>Back to {label}</span>
    </Button>
  );
}
