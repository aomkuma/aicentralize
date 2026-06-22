import { SystemRole, UserRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";

type AuthPayload = JwtPayload & {
  sub: string;
  role: UserRole;
  systemRole?: SystemRole;
  email: string;
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const token = auth.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = {
      id: payload.sub,
      role: payload.role,
      systemRole: payload.systemRole ?? SystemRole.USER,
      email: payload.email
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
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
