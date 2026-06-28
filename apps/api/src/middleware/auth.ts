import { SystemRole, UserRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

type AuthPayload = JwtPayload & {
  sub: string;
  role: UserRole;
  systemRole?: SystemRole;
  email: string;
};

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const token = auth.slice("Bearer ".length);
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    res.status(401).json({ message: "Invalid token" });
    return;
  }

  // Revoke access immediately when an account is suspended, without waiting for
  // the access token to expire. role/systemRole are read fresh so role changes
  // also take effect right away.
  const account = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, systemRole: true, email: true, isActive: true }
  });

  if (!account || !account.isActive) {
    res.status(401).json({ message: "Account suspended" });
    return;
  }

  req.user = {
    id: account.id,
    role: account.role,
    systemRole: account.systemRole,
    email: account.email
  };
  next();
}

export function requireRole(allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}

export function requireSystemRole(allowed: SystemRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!allowed.includes(req.user.systemRole)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}
