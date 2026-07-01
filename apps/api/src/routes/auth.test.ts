import { SystemRole, UserRole } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const refreshTokenFindUnique = vi.fn();
const refreshTokenCreate = vi.fn();
const refreshTokenUpdate = vi.fn();
const refreshTokenUpdateMany = vi.fn();
const bcryptCompare = vi.fn();
const bcryptHash = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args)
    },
    refreshToken: {
      findUnique: (...args: unknown[]) => refreshTokenFindUnique(...args),
      create: (...args: unknown[]) => refreshTokenCreate(...args),
      update: (...args: unknown[]) => refreshTokenUpdate(...args),
      updateMany: (...args: unknown[]) => refreshTokenUpdateMany(...args)
    }
  }
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => bcryptCompare(...args),
    hash: (...args: unknown[]) => bcryptHash(...args)
  }
}));

import { authRouter } from "./auth";
import { env } from "../config/env";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  return app;
}

describe("auth suspended-account handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bcryptCompare.mockResolvedValue(true);
    bcryptHash.mockResolvedValue("hashed-value");
    refreshTokenCreate.mockResolvedValue(undefined);
    refreshTokenUpdate.mockResolvedValue(undefined);
    refreshTokenUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("blocks suspended users from logging in", async () => {
    userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      passwordHash: "hashed-password",
      role: UserRole.MEMBER,
      systemRole: SystemRole.USER,
      isActive: false
    });

    const response = await request(createTestApp())
      .post("/auth/login")
      .send({ email: "member@example.com", password: "Password123!" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: "Account suspended" });
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("blocks suspended users from refreshing a session", async () => {
    refreshTokenFindUnique.mockResolvedValue({
      id: "refresh-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-1",
        email: "member@example.com",
        role: UserRole.MEMBER,
        systemRole: SystemRole.USER,
        isActive: false
      }
    });

    const response = await request(createTestApp())
      .post("/auth/refresh")
      .send({ refreshToken: "r".repeat(64) });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: "Account suspended" });
    expect(refreshTokenUpdate).not.toHaveBeenCalled();
  });

  it("revokes authenticated access immediately for suspended users", async () => {
    const accessToken = jwt.sign(
      {
        role: UserRole.MEMBER,
        systemRole: SystemRole.USER,
        email: "member@example.com"
      },
      env.jwtSecret,
      { subject: "user-1", expiresIn: "1h" }
    );

    userFindUnique.mockResolvedValue({
      id: "user-1",
      role: UserRole.MEMBER,
      systemRole: SystemRole.USER,
      email: "member@example.com",
      isActive: false
    });

    const response = await request(createTestApp())
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Account suspended" });
  });
});
