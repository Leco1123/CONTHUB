// server/db/index.js
const { PrismaClient } = require("@prisma/client");

const globalForPrisma = global;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

prisma.close = async () => {
  await prisma.$disconnect();
  console.log("✅ Prisma desconectado com sucesso.");
};

module.exports = prisma;