import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { backfillKnowledgeChunks } from "../src/services/retrieval/knowledgeIndexService";

const prisma = new PrismaClient();

async function main() {
  const limit = Number(process.argv[2] ?? 500);
  const result = await backfillKnowledgeChunks(Number.isFinite(limit) ? limit : 500);

  console.log("[knowledge-backfill] complete");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("[knowledge-backfill] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
