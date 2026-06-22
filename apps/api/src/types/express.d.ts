import { SystemRole, UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        systemRole: SystemRole;
        email: string;
      };
    }
  }
}

export {};
