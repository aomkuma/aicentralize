import { SystemRole, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nickname: z.string().trim().min(1).max(80).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  tenantId: z.string().min(1).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).optional(),
  newPassword: z.string().min(8).max(72)
});

const acceptInvitationSchema = z.object({
  password: z.string().min(8).max(72)
});

function signAccessToken(user: {
  id: string;
  email: string;
  role: UserRole;
  systemRole: SystemRole;
}) {
  return jwt.sign(
    { role: user.role, systemRole: user.systemRole, email: user.email },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: env.jwtAccessTokenTtl as jwt.SignOptions["expiresIn"]
    }
  );
}

function createRefreshTokenValue() {
  return crypto.randomBytes(64).toString("hex");
}

function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function issueRefreshToken(params: {
  userId: string;
  userAgent?: string;
}) {
  const rawToken = createRefreshTokenValue();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + env.jwtRefreshTokenDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: params.userId,
      tokenHash,
      userAgent: params.userAgent?.slice(0, 255),
      expiresAt
    }
  });

  return rawToken;
}

authRouter.get("/login", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login | Kora</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
            display: ["Sora", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"]
          },
          colors: {
            deep: "#13233f"
          }
        }
      }
    };
  </script>
  <style>
    body {
      background:
        radial-gradient(70vw 50vh at -10% 20%, rgba(136, 219, 180, 0.36), transparent 65%),
        radial-gradient(60vw 40vh at 108% 18%, rgba(147, 191, 255, 0.30), transparent 65%),
        linear-gradient(180deg, #f9fcff 0%, #f4f9ff 42%, #eef6f8 100%);
    }
    .glass {
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(8px);
    }
  </style>
</head>
<body class="font-sans text-deep antialiased">
  <main class="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <header class="glass rounded-2xl border border-white/70 px-5 py-3 shadow-card sm:px-7">
      <div class="flex items-center justify-between gap-3">
        <a href="/" class="flex items-center gap-3">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 text-lg font-extrabold text-white">A</div>
          <div>
            <p class="font-display text-lg font-bold tracking-tight">Kora</p>
            <p class="text-xs text-slate-500">AI workspace for modern teams</p>
          </div>
        </a>

        <nav class="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          <a href="/#features" class="transition hover:text-blue-600">Features</a>
          <a href="/#workflow" class="transition hover:text-blue-600">Workflow</a>
          <a href="/docs" class="transition hover:text-blue-600">API Docs</a>
          <a href="/health" class="transition hover:text-blue-600">Health</a>
        </nav>

        <div class="flex items-center gap-2 sm:gap-3">
          <a href="/ai/playground/page" class="hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] sm:inline-block">Get Started</a>
          <button id="menuToggle" type="button" class="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 md:hidden" aria-controls="mobileMenu" aria-expanded="false" aria-label="Open navigation menu">
            <svg id="menuIconOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg id="menuIconClose" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div id="mobileMenu" class="mt-3 hidden rounded-xl border border-slate-200 bg-white p-3 md:hidden">
        <nav class="grid gap-2 text-sm font-semibold text-slate-700">
          <a href="/#features" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Features</a>
          <a href="/#workflow" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Workflow</a>
          <a href="/docs" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">API Docs</a>
          <a href="/health" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Health</a>
          <a href="/ai/playground/page" class="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-center text-white">Get Started</a>
        </nav>
      </div>
    </header>

    <section class="mx-auto mt-8 w-full max-w-lg">
      <div class="glass rounded-2xl border border-white/80 p-6 shadow-2xl sm:p-7">
        <h1 class="font-display text-2xl font-extrabold">Log in</h1>
        <p class="mt-1 text-sm text-slate-500">Sign in once, then your device session can auto-refresh without pasting token every time.</p>

        <div class="mt-5 space-y-3">
          <div>
            <label for="email" class="mb-1 block text-sm font-semibold text-slate-600">Email</label>
            <input id="email" type="email" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="you@company.com" />
          </div>

          <div>
            <label for="password" class="mb-1 block text-sm font-semibold text-slate-600">Password</label>
            <input id="password" type="password" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="••••••••" />
          </div>

          <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input id="rememberDevice" type="checkbox" checked disabled /> Refresh token session is enabled for this device
          </label>

          <div class="pt-1">
            <button id="loginBtn" type="button" class="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.01]">Log in</button>
          </div>

          <div id="status" class="min-h-[1.2em] text-sm text-slate-600"></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    const menuToggleEl = document.getElementById("menuToggle");
    const mobileMenuEl = document.getElementById("mobileMenu");
    const menuIconOpenEl = document.getElementById("menuIconOpen");
    const menuIconCloseEl = document.getElementById("menuIconClose");

    if (menuToggleEl && mobileMenuEl && menuIconOpenEl && menuIconCloseEl) {
      const setOpen = (open) => {
        mobileMenuEl.classList.toggle("hidden", !open);
        menuIconOpenEl.classList.toggle("hidden", open);
        menuIconCloseEl.classList.toggle("hidden", !open);
        menuToggleEl.setAttribute("aria-expanded", String(open));
      };
      setOpen(false);
      menuToggleEl.addEventListener("click", () => {
        const isOpen = !mobileMenuEl.classList.contains("hidden");
        setOpen(!isOpen);
      });
    }

    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const statusEl = document.getElementById("status");
    const loginBtn = document.getElementById("loginBtn");

    const setStatus = (text) => {
      statusEl.textContent = text || "";
    };

    function getNextPath() {
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next");
      if (!next || !next.startsWith("/")) {
        return "/notifications/settings/page";
      }
      return next;
    }

    loginBtn.addEventListener("click", async () => {
      try {
        const email = emailEl.value.trim();
        const password = passwordEl.value;
        if (!email || !password) {
          throw new Error("Email and password are required");
        }

        loginBtn.disabled = true;
        setStatus("Logging in...");

        const response = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Login failed");
        }

        if (data.token) {
          localStorage.setItem("aicentralize_token", data.token);
        }
        if (data.refreshToken) {
          localStorage.setItem("aicentralize_refresh_token", data.refreshToken);
        }
        setStatus("Login successful. Redirecting...");
        window.location.assign(getNextPath());
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Login failed");
      } finally {
        loginBtn.disabled = false;
      }
    });

    passwordEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        loginBtn.click();
      }
    });
  </script>
</body>
</html>`);
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: "Account suspended" });
  }

  const token = signAccessToken({
    id: user.id,
    role: user.role as UserRole,
    systemRole: user.systemRole as SystemRole,
    email: user.email
  });
  const refreshToken = await issueRefreshToken({
    userId: user.id,
    userAgent: req.get("user-agent") || undefined
  });

  return res.json({
    accessToken: token,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      phone: user.phone,
      role: user.role as UserRole,
      systemRole: user.systemRole as SystemRole,
      mustChangePassword: user.mustChangePassword
    }
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      phone: true,
      role: true,
      systemRole: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.json(user);
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      name: parsed.data.name,
      nickname: parsed.data.nickname?.trim() || null,
      phone: parsed.data.phone?.trim() || null
    },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      phone: true,
      role: true,
      systemRole: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (parsed.data.tenantId && parsed.data.nickname !== undefined) {
    const membership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: parsed.data.tenantId,
          userId: req.user!.id
        }
      },
      select: { id: true }
    });

    if (membership) {
      await prisma.tenantMembership.update({
        where: { id: membership.id },
        data: { nickname: parsed.data.nickname?.trim() || null }
      });
    }
  }

  return res.json(user);
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.mustChangePassword) {
    if (!parsed.data.currentPassword) {
      return res.status(400).json({ message: "Current password is required" });
    }

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false
    }
  });

  return res.json({ ok: true });
});

authRouter.get("/invitations/:token", async (req, res) => {
  const tokenHash = hashInviteToken(req.params.token);
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          isActive: true
        }
      }
    }
  });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    return res.status(404).json({ message: "Invitation not found or expired" });
  }

  if (!invitation.tenant.isActive) {
    return res.status(403).json({ message: "Organization is inactive" });
  }

  return res.json({
    email: invitation.email,
    name: invitation.name,
    nickname: invitation.nickname,
    tenantName: invitation.tenant.name,
    expiresAt: invitation.expiresAt
  });
});

authRouter.post("/invitations/:token/accept", async (req, res) => {
  const parsed = acceptInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const tokenHash = hashInviteToken(req.params.token);
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash },
    include: {
      tenant: {
        select: {
          id: true,
          isActive: true
        }
      }
    }
  });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
    return res.status(404).json({ message: "Invitation not found or expired" });
  }

  if (!invitation.tenant.isActive) {
    return res.status(403).json({ message: "Organization is inactive" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const email = invitation.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      systemRole: true
    }
  });

  const user = existingUser
    ? await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name: invitation.name,
        phone: invitation.phone,
        passwordHash,
        mustChangePassword: false
      }
    })
    : await prisma.user.create({
      data: {
        email,
        name: invitation.name,
        nickname: invitation.nickname,
        phone: invitation.phone,
        passwordHash,
        mustChangePassword: false,
        role: invitation.userRole,
        systemRole: SystemRole.USER
      }
    });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: invitation.tenantId,
        userId: user.id
      }
    },
    create: {
      tenantId: invitation.tenantId,
      userId: user.id,
      role: invitation.tenantRole,
      nickname: invitation.nickname,
      jobTitle: invitation.jobTitle,
      department: invitation.department,
      isActive: true
    },
    update: {
      role: invitation.tenantRole,
      nickname: invitation.nickname,
      jobTitle: invitation.jobTitle,
      department: invitation.department,
      isActive: true
    }
  });

  await prisma.userInvitation.update({
    where: { id: invitation.id },
    data: {
      acceptedAt: new Date(),
      acceptedUserId: user.id
    }
  });

  const token = signAccessToken({
    id: user.id,
    role: user.role as UserRole,
    systemRole: user.systemRole as SystemRole,
    email: user.email
  });
  const refreshToken = await issueRefreshToken({
    userId: user.id,
    userAgent: req.get("user-agent") || undefined
  });

  return res.json({
    accessToken: token,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      phone: user.phone,
      role: user.role as UserRole,
      systemRole: user.systemRole as SystemRole,
      mustChangePassword: user.mustChangePassword
    }
  });
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const tokenHash = hashRefreshToken(parsed.data.refreshToken);
  const item = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!item || item.revokedAt || item.expiresAt.getTime() <= Date.now()) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  if (!item.user.isActive) {
    return res.status(403).json({ message: "Account suspended" });
  }

  const newRefreshToken = await issueRefreshToken({
    userId: item.userId,
    userAgent: req.get("user-agent") || undefined
  });

  await prisma.refreshToken.update({
    where: { id: item.id },
    data: { revokedAt: new Date() }
  });

  const token = signAccessToken({
    id: item.user.id,
    role: item.user.role as UserRole,
    systemRole: item.user.systemRole as SystemRole,
    email: item.user.email
  });

  return res.json({ accessToken: token, token, refreshToken: newRefreshToken });
});

authRouter.post("/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const tokenHash = hashRefreshToken(parsed.data.refreshToken);
  await prisma.refreshToken.updateMany({
    where: {
      tokenHash,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });

  return res.status(204).send();
});
