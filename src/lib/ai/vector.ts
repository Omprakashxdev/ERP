import { hasPermissionWithOverrides } from "@/lib/authz";
import { SessionUser } from "@/lib/actions/wrapper";

export interface VectorQueryResult {
  success: boolean;
  results?: unknown[];
  message?: string;
}

export async function queryVectorStore(
  user: SessionUser,
  query: string
): Promise<VectorQueryResult> {
  if (!(await hasPermissionWithOverrides(user.role, "fundFlow", "read", user.id))) {
    return {
      success: false,
      message: "You do not have permission to query the knowledge base.",
    };
  }

  // Pinecone integration will be wired once the knowledge base is populated.
  void query;
  return {
    success: false,
    message: "Vector store is not configured.",
  };
}
