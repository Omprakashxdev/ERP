import { redirect } from "next/navigation";

export default function ClientsPage() {
  redirect("/dashboard/masters?tab=clients");
}

