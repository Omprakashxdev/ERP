"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { TemplateForm } from "../template-form";

export function TemplateDetailActions({
  template,
}: {
  template: { id: string; name: string; description?: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit template
      </Button>
      <TemplateForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
        template={template}
      />
    </div>
  );
}
