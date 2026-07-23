import { Role } from "@prisma/client";

export { Role };

export type Permission = "create" | "read" | "update" | "delete" | "admin";

export interface ResourcePermission {
  resource: string;
  actions: Permission[];
}

declare module "next-auth" {
  interface User {
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: Role;
    };
  }
}
