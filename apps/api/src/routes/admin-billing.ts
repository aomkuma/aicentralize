import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  SystemRole,
  TenantBillingEventType,
  type TenantBillingPeriodStatus,
  type TenantBillingPaymentStatus
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import {
  approveBillingPayment,
  recordBillingEvent,
  rejectBillingPayment
} from "../services/tenantBillingService";

export const adminBillingRouter = Router();

const slipDir = path.join(process.cwd(), "uploads", "billing-slips");
fs.mkdirSync(slipDir, { recursive: true });

const slipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, slipDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(ext) ? ext : ".bin";
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ]);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPG, PNG, WEBP, or PDF files are allowed"));
  }
});

const billingPeriodStatusSchema = z.enum([
  "OPEN",
  "AWAITING_PAYMENT",
  "PAID",
  "PAST_DUE",
  "VOID"
]);

const listPeriodsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: billingPeriodStatusSchema.optional(),
  tenantId: z.string().min(1).optional()
});

const reviewPaymentSchema = z.object({
  reviewNote: z.string().trim().max(500).optional().nullable()
});

adminBillingRouter.use(requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]));

function serializePeriod(period: {
  id: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date | null;
  packageId: string | null;
  packageCode: string;
  packageName: string | null;
  amountCents: number;
  currency: string;
  status: TenantBillingPeriodStatus;
  paidAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { id: string; name: string; slug: string; billingStatus: string };
  payments: Array<{
    id: string;
    status: TenantBillingPaymentStatus;
    slipFileName: string;
    slipMimeType: string | null;
    slipSizeBytes: number | null;
    submittedAt: Date;
    reviewedAt: Date | null;
    reviewNote: string | null;
    submittedBy: { id: string; name: string; email: string };
    reviewedBy: { id: string; name: string; email: string } | null;
  }>;
}) {
  return {
    id: period.id,
    tenantId: period.tenantId,
    tenant: period.tenant,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    packageId: period.packageId,
    packageCode: period.packageCode,
    packageName: period.packageName,
    amountCents: period.amountCents,
    currency: period.currency,
    status: period.status,
    paidAt: period.paidAt,
    closedAt: period.closedAt,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
    payments: period.payments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      slipFileName: payment.slipFileName,
      slipMimeType: payment.slipMimeType,
      slipSizeBytes: payment.slipSizeBytes,
      submittedAt: payment.submittedAt,
      reviewedAt: payment.reviewedAt,
      reviewNote: payment.reviewNote,
      submittedBy: payment.submittedBy,
      reviewedBy: payment.reviewedBy
    }))
  };
}

adminBillingRouter.get("/periods", async (req, res) => {
  const parsed = listPeriodsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const { page, limit, status, tenantId } = parsed.data;
  const where = {
    ...(status ? { status } : {}),
    ...(tenantId ? { tenantId } : {})
  };

  const [total, periods] = await Promise.all([
    prisma.tenantBillingPeriod.count({ where }),
    prisma.tenantBillingPeriod.findMany({
      where,
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            billingStatus: true
          }
        },
        payments: {
          orderBy: { submittedAt: "desc" },
          include: {
            submittedBy: {
              select: { id: true, name: true, email: true }
            },
            reviewedBy: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    })
  ]);

  res.json({
    items: periods.map(serializePeriod),
    total,
    page,
    limit
  });
});

adminBillingRouter.get("/tenants/:tenantId", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      billingStatus: true,
      billingStartDate: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      currentPackage: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });

  if (!tenant) {
    return res.status(404).json({ message: "Organization not found" });
  }

  const [periods, events] = await Promise.all([
    prisma.tenantBillingPeriod.findMany({
      where: { tenantId: tenant.id },
      orderBy: { periodStart: "desc" },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            billingStatus: true
          }
        },
        payments: {
          orderBy: { submittedAt: "desc" },
          include: {
            submittedBy: {
              select: { id: true, name: true, email: true }
            },
            reviewedBy: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    }),
    prisma.tenantBillingEvent.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: {
          select: { id: true, name: true, email: true }
        }
      }
    })
  ]);

  res.json({
    tenant,
    periods: periods.map(serializePeriod),
    events
  });
});

adminBillingRouter.post("/periods/:periodId/payments", (req, res) => {
  slipUpload.single("slip")(req, res, async (uploadError) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Slip file is too large (max 10 MB)." });
    }

    if (uploadError) {
      return res.status(400).json({
        message: uploadError instanceof Error ? uploadError.message : "Upload failed"
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Missing slip file upload." });
    }

    const period = await prisma.tenantBillingPeriod.findUnique({
      where: { id: req.params.periodId }
    });

    if (!period) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(404).json({ message: "Billing period not found" });
    }

    if (period.status === "PAID") {
      fs.unlink(req.file.path, () => undefined);
      return res.status(400).json({ message: "This billing period is already paid." });
    }

    const pendingPayment = await prisma.tenantBillingPayment.findFirst({
      where: {
        periodId: period.id,
        status: "PENDING"
      }
    });

    if (pendingPayment) {
      fs.unlink(req.file.path, () => undefined);
      return res.status(409).json({ message: "A payment slip is already pending review for this period." });
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.tenantBillingPayment.create({
        data: {
          periodId: period.id,
          tenantId: period.tenantId,
          slipFileName: req.file!.originalname,
          slipStoredName: req.file!.filename,
          slipMimeType: req.file!.mimetype,
          slipSizeBytes: req.file!.size,
          submittedByUserId: req.user!.id
        },
        include: {
          submittedBy: {
            select: { id: true, name: true, email: true }
          },
          reviewedBy: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (period.status === "OPEN") {
        await tx.tenantBillingPeriod.update({
          where: { id: period.id },
          data: { status: "AWAITING_PAYMENT" }
        });
      }

      await recordBillingEvent(tx, {
        tenantId: period.tenantId,
        type: TenantBillingEventType.PAYMENT_SUBMITTED,
        actorUserId: req.user!.id,
        payloadJson: {
          paymentId: created.id,
          periodId: period.id,
          slipFileName: created.slipFileName
        }
      });

      return created;
    });

    res.status(201).json(payment);
  });
});

adminBillingRouter.get("/payments/:paymentId/slip", async (req, res) => {
  const payment = await prisma.tenantBillingPayment.findUnique({
    where: { id: req.params.paymentId }
  });

  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }

  const filePath = path.join(slipDir, payment.slipStoredName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Slip file not found" });
  }

  if (payment.slipMimeType) {
    res.type(payment.slipMimeType);
  }

  res.setHeader("Content-Disposition", `inline; filename="${payment.slipFileName}"`);
  res.sendFile(filePath);
});

adminBillingRouter.post("/payments/:paymentId/approve", async (req, res) => {
  const parsed = reviewPaymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const payment = await approveBillingPayment({
      paymentId: req.params.paymentId,
      reviewerUserId: req.user!.id,
      reviewNote: parsed.data.reviewNote
    });
    res.json(payment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to approve payment";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
});

adminBillingRouter.post("/payments/:paymentId/reject", async (req, res) => {
  const parsed = reviewPaymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const payment = await rejectBillingPayment({
      paymentId: req.params.paymentId,
      reviewerUserId: req.user!.id,
      reviewNote: parsed.data.reviewNote
    });
    res.json(payment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reject payment";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ message });
  }
});
