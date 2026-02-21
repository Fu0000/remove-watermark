import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  {
    planId: "free",
    name: "Free",
    price: 0,
    currency: "CNY",
    monthlyQuota: 20,
    features: ["standard_quality", "basic_queue"],
    sortOrder: 10
  },
  {
    planId: "pro_month",
    name: "Pro 月付",
    price: 39,
    currency: "CNY",
    monthlyQuota: 300,
    features: ["high_quality", "priority_queue"],
    sortOrder: 20
  },
  {
    planId: "pro_year",
    name: "Pro 年付",
    price: 299,
    currency: "CNY",
    monthlyQuota: 3600,
    features: ["high_quality", "priority_queue"],
    sortOrder: 30
  }
] as const;

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { planId: plan.planId },
      update: {
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        monthlyQuota: plan.monthlyQuota,
        features: plan.features,
        sortOrder: plan.sortOrder,
        isActive: true
      },
      create: {
        planId: plan.planId,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        monthlyQuota: plan.monthlyQuota,
        features: plan.features,
        sortOrder: plan.sortOrder,
        isActive: true
      }
    });
  }

  console.log(`[seed-plans] seeded plans=${plans.length}`);
}

main()
  .catch((error) => {
    console.error("[seed-plans] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
