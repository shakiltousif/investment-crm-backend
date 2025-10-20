import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create test user
  const hashedPassword = await bcrypt.hash('TestPassword123!', 10);

  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+1234567890',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      kycStatus: 'VERIFIED',
      kycVerifiedAt: new Date(),
    },
  });

  console.log('Created test user:', user);

  // Create test portfolio
  const portfolio = await prisma.portfolio.create({
    data: {
      userId: user.id,
      name: 'My Portfolio',
      description: 'My investment portfolio',
      totalValue: 10000,
      totalInvested: 10000,
      totalGain: 0,
      gainPercentage: 0,
    },
  });

  console.log('Created test portfolio:', portfolio);

  // Create test bank account
  const bankAccount = await prisma.bankAccount.create({
    data: {
      userId: user.id,
      accountHolderName: 'Test User',
      accountNumber: '1234567890',
      bankName: 'Test Bank',
      accountType: 'Savings',
      currency: 'USD',
      balance: 5000,
      isVerified: true,
      verifiedAt: new Date(),
      isPrimary: true,
    },
  });

  console.log('Created test bank account:', bankAccount);

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

