require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ["error"],
});

async function main() {
  console.log("Testando conexao Prisma/PostgreSQL remoto...");

  const dbInfo = await prisma.$queryRaw`
    SELECT
      current_database() AS database,
      current_user AS user,
      inet_server_addr()::text AS server_addr,
      inet_server_port() AS server_port,
      version() AS version
  `;

  console.log("Banco conectado:", dbInfo[0]);

  const users = await prisma.user.findMany({
    take: 10,
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  console.log(`Usuarios encontrados: ${users.length}`);
  console.table(users);
}

main()
  .catch((err) => {
    console.error("Falha no teste Prisma remoto:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
