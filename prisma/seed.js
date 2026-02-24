// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // limpa tabelas
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  // cria admin correto
  const hash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@local',  // <- O PAINEL EXIGE ESTE EMAIL
      password: hash         // <- campo PASSWORD existe no schema
    }
  });

  console.log('👤 Admin criado:', admin.email);

  // cria cliente teste
  await prisma.customer.create({
    data: {
      
      name: 'Cliente Teste',
      email: 'cliente@local.com',
      phone: '11999999999',
      document: '12345678900',
      createdById: admin.id
    }
  });

  console.log('🧾 Cliente criado.');
  console.log('🌱 Seed finalizado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });