import {
  Prisma,
  TenantBillingEventType,
  TenantBillingPeriodStatus,
  type TenantBillingPeriod
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { effectivePackagePriceCents } from "../lib/packagePricing";

export const DEFAULT_BILLING_TIMEZONE = "Asia/Bangkok";

type DbClient = Prisma.TransactionClient | typeof prisma;

export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const day = date.getDate();
  const result = new Date(year, month, 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfMonth));
  return result;
}

export function computePeriodEnd(start: Date, billingInterval: string): Date | null {
  switch (billingInterval) {
    case "YEARLY": {
      const end = new Date(start);
      end.setFullYear(end.getFullYear() + 1);
      return end;
    }
    case "MONTHLY":
      return addCalendarMonths(start, 1);
    case "ONE_TIME":
    case "CUSTOM":
    default:
      return null;
  }
}

async function loadPackageSnapshot(packageId: string | null | undefined) {
  if (!packageId) {
    return {
      packageId: null,
      packageCode: "UNKNOWN",
      packageName: null,
      amountCents: 0,
      currency: "THB",
      billingInterval: "MONTHLY"
    };
  }

  const pkg = await prisma.subscriptionPackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      code: true,
      name: true,
      priceCents: true,
      currency: true,
      billingInterval: true,
      discountType: true,
      discountValue: true
    }
  });

  if (!pkg) {
    return {
      packageId: null,
      packageCode: "UNKNOWN",
      packageName: null,
      amountCents: 0,
      currency: "THB",
      billingInterval: "MONTHLY"
    };
  }

  return {
    packageId: pkg.id,
    packageCode: pkg.code,
    packageName: pkg.name,
    amountCents: effectivePackagePriceCents(pkg),
    currency: pkg.currency,
    billingInterval: pkg.billingInterval
  };
}

export async function recordBillingEvent(
  db: DbClient,
  params: {
    tenantId: string;
    type: TenantBillingEventType;
    actorUserId?: string | null;
    payloadJson?: Prisma.InputJsonValue;
  }
) {
  return db.tenantBillingEvent.create({
    data: {
      tenantId: params.tenantId,
      type: params.type,
      actorUserId: params.actorUserId ?? null,
      payloadJson: params.payloadJson ?? Prisma.JsonNull
    }
  });
}

export async function createBillingPeriod(
  db: DbClient,
  params: {
    tenantId: string;
    periodStart: Date;
    periodEnd: Date | null;
    packageId: string | null;
    packageCode: string;
    packageName: string | null;
    amountCents: number;
    currency: string;
    status: TenantBillingPeriodStatus;
    actorUserId?: string | null;
    paidAt?: Date | null;
  }
): Promise<TenantBillingPeriod> {
  const period = await db.tenantBillingPeriod.create({
    data: {
      tenantId: params.tenantId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      packageId: params.packageId,
      packageCode: params.packageCode,
      packageName: params.packageName,
      amountCents: params.amountCents,
      currency: params.currency,
      status: params.status,
      paidAt: params.paidAt ?? null
    }
  });

  await recordBillingEvent(db, {
    tenantId: params.tenantId,
    type: TenantBillingEventType.PERIOD_OPENED,
    actorUserId: params.actorUserId,
    payloadJson: {
      periodId: period.id,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd?.toISOString() ?? null,
      packageCode: period.packageCode,
      amountCents: period.amountCents,
      status: period.status
    }
  });

  return period;
}

export async function recordTenantPackageChange(params: {
  tenantId: string;
  actorUserId: string;
  previousPackageId: string | null;
  nextPackageId: string | null;
}) {
  if (params.previousPackageId === params.nextPackageId) {
    return;
  }

  const [previousPackage, nextPackage] = await Promise.all([
    params.previousPackageId
      ? prisma.subscriptionPackage.findUnique({
          where: { id: params.previousPackageId },
          select: { id: true, code: true, name: true }
        })
      : Promise.resolve(null),
    params.nextPackageId
      ? prisma.subscriptionPackage.findUnique({
          where: { id: params.nextPackageId },
          select: { id: true, code: true, name: true }
        })
      : Promise.resolve(null)
  ]);

  await recordBillingEvent(prisma, {
    tenantId: params.tenantId,
    type: TenantBillingEventType.PACKAGE_CHANGED,
    actorUserId: params.actorUserId,
    payloadJson: {
      previousPackageId: previousPackage?.id ?? null,
      previousPackageCode: previousPackage?.code ?? null,
      nextPackageId: nextPackage?.id ?? null,
      nextPackageCode: nextPackage?.code ?? null
    }
  });
}

async function completeActivationBilling(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    activatedAt: Date;
    packageId: string | null;
    periodEnd: Date | null;
  }
) {
  const snapshot = await loadPackageSnapshot(params.packageId);
  const periodStatus =
    snapshot.amountCents <= 0
      ? TenantBillingPeriodStatus.PAID
      : TenantBillingPeriodStatus.AWAITING_PAYMENT;

  await recordBillingEvent(db, {
    tenantId: params.tenantId,
    type: TenantBillingEventType.ACTIVATED,
    actorUserId: params.userId,
    payloadJson: {
      activatedAt: params.activatedAt.toISOString(),
      billingTimezone: DEFAULT_BILLING_TIMEZONE
    }
  });

  await createBillingPeriod(db, {
    tenantId: params.tenantId,
    periodStart: params.activatedAt,
    periodEnd: params.periodEnd,
    packageId: snapshot.packageId,
    packageCode: snapshot.packageCode,
    packageName: snapshot.packageName,
    amountCents: snapshot.amountCents,
    currency: snapshot.currency,
    status: periodStatus,
    actorUserId: params.userId,
    paidAt: periodStatus === TenantBillingPeriodStatus.PAID ? params.activatedAt : null
  });
}

export async function maybeActivateTenantOnFirstLogin(userId: string): Promise<void> {
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      userId,
      isActive: true,
      tenant: {
        isActive: true,
        billingStartDate: null
      }
    },
    select: {
      tenantId: true
    }
  });

  if (!memberships.length) {
    return;
  }

  const activatedAt = new Date();

  for (const membership of memberships) {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: membership.tenantId },
        select: {
          id: true,
          billingStartDate: true,
          currentPackageId: true,
          currentPackage: {
            select: {
              billingInterval: true
            }
          }
        }
      });

      if (!tenant || tenant.billingStartDate) {
        return;
      }

      const billingInterval = tenant.currentPackage?.billingInterval ?? "MONTHLY";
      const currentPeriodEnd = computePeriodEnd(activatedAt, billingInterval);

      const updated = await tx.tenant.updateMany({
        where: {
          id: tenant.id,
          billingStartDate: null
        },
        data: {
          billingStatus: "ACTIVE",
          billingStartDate: activatedAt,
          billingTimezone: DEFAULT_BILLING_TIMEZONE,
          currentPeriodStart: activatedAt,
          currentPeriodEnd,
          activatedAt,
          activatedByUserId: userId
        }
      });

      if (updated.count === 0) {
        return;
      }

      await completeActivationBilling(tx, {
        tenantId: tenant.id,
        userId,
        activatedAt,
        packageId: tenant.currentPackageId,
        periodEnd: currentPeriodEnd
      });
    });
  }
}

export async function countActiveTenantMembers(tenantId: string): Promise<number> {
  return prisma.tenantMembership.count({
    where: {
      tenantId,
      isActive: true
    }
  });
}

export async function ensureTenantHasUserCapacity(tenantId: string): Promise<
  { allowed: true } | { allowed: false; message: string }
> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      currentPackage: {
        select: {
          maxUsers: true
        }
      }
    }
  });

  const maxUsers = tenant?.currentPackage?.maxUsers;
  if (maxUsers === undefined || maxUsers === null) {
    return { allowed: true };
  }

  const activeCount = await countActiveTenantMembers(tenantId);
  if (activeCount >= maxUsers) {
    return {
      allowed: false,
      message: "Member limit reached for current subscription package"
    };
  }

  return { allowed: true };
}

export async function ensureTenantCanAddMember(
  tenantId: string,
  userId: string
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const existing = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId
      }
    },
    select: {
      isActive: true
    }
  });

  if (existing?.isActive) {
    return { allowed: true };
  }

  return ensureTenantHasUserCapacity(tenantId);
}

export async function approveBillingPayment(params: {
  paymentId: string;
  reviewerUserId: string;
  reviewNote?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.tenantBillingPayment.findUnique({
      where: { id: params.paymentId },
      include: {
        period: true
      }
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "PENDING") {
      throw new Error("Payment is not pending review");
    }

    const reviewedAt = new Date();

    const updatedPayment = await tx.tenantBillingPayment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        reviewedByUserId: params.reviewerUserId,
        reviewNote: params.reviewNote ?? null,
        reviewedAt
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

    await tx.tenantBillingPeriod.update({
      where: { id: payment.periodId },
      data: {
        status: "PAID",
        paidAt: reviewedAt
      }
    });

    await tx.tenant.update({
      where: { id: payment.tenantId },
      data: {
        billingStatus: "ACTIVE"
      }
    });

    await recordBillingEvent(tx, {
      tenantId: payment.tenantId,
      type: TenantBillingEventType.PAYMENT_APPROVED,
      actorUserId: params.reviewerUserId,
      payloadJson: {
        paymentId: payment.id,
        periodId: payment.periodId,
        reviewNote: params.reviewNote ?? null
      }
    });

    return updatedPayment;
  });
}

export async function rejectBillingPayment(params: {
  paymentId: string;
  reviewerUserId: string;
  reviewNote?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.tenantBillingPayment.findUnique({
      where: { id: params.paymentId }
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "PENDING") {
      throw new Error("Payment is not pending review");
    }

    const reviewedAt = new Date();

    const updatedPayment = await tx.tenantBillingPayment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        reviewedByUserId: params.reviewerUserId,
        reviewNote: params.reviewNote ?? null,
        reviewedAt
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

    await recordBillingEvent(tx, {
      tenantId: payment.tenantId,
      type: TenantBillingEventType.PAYMENT_REJECTED,
      actorUserId: params.reviewerUserId,
      payloadJson: {
        paymentId: payment.id,
        periodId: payment.periodId,
        reviewNote: params.reviewNote ?? null
      }
    });

    return updatedPayment;
  });
}
