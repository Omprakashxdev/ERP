import { redirect } from "next/navigation";

export default function StaffPage() {
  redirect("/dashboard/masters?tab=employee");
}
