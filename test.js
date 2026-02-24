const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const u = await prisma.user.create({
        data: { name: "Admin", email: "admin@teste.com", passwordHash: "123"}
    });
    console.log(u);
}
main().finally(() => prisma.$disconnect());