import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Decimal } from '@prisma/client/runtime/library';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Starting database seed - using console.warn for consistency
  console.warn('Starting database seed...');

  // Create test user (client)
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
      role: 'CLIENT',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      kycStatus: 'VERIFIED',
      kycVerifiedAt: new Date(),
    },
  });

  // Created test user - using console.warn for consistency
  console.warn('Created test user:', user);

  // Create admin user
  const adminHashedPassword = await bcrypt.hash('AdminPassword123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@fil-limited.com' },
    update: {},
    create: {
      email: 'admin@fil-limited.com',
      password: adminHashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      phoneNumber: '+1234567891',
      role: 'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      kycStatus: 'VERIFIED',
      kycVerifiedAt: new Date(),
    },
  });

  // Created admin user - using console.warn for consistency
  console.warn('Created admin user:', admin);

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

  // Created test portfolio - using console.warn for consistency
  console.warn('Created test portfolio:', portfolio);

  // Create test bank account
  const bankAccount = await prisma.bankAccount.upsert({
    where: {
      userId_accountNumber: {
        userId: user.id,
        accountNumber: '1234567890',
      },
    },
    update: {},
    create: {
      userId: user.id,
      accountHolderName: 'Test User',
      accountNumber: '1234567890',
      bankName: 'Test Bank',
      accountType: 'Savings',
      currency: 'GBP',
      balance: 5000,
      isVerified: true,
      verifiedAt: new Date(),
      isPrimary: true,
    },
  });

  // Created test bank account - using console.warn for consistency
  console.warn('Created test bank account:', bankAccount);

  // Create marketplace items
  const marketplaceItems = [
    {
      name: 'Apple Inc. (AAPL)',
      type: 'STOCK' as const,
      symbol: 'AAPL',
      description: 'Technology company focused on consumer electronics and software',
      currentPrice: new Decimal(175.5),
      minimumInvestment: new Decimal(100),
      maximumInvestment: new Decimal(100000),
      currency: 'GBP',
      riskLevel: 'MEDIUM' as const,
      expectedReturn: new Decimal(8.5),
      category: 'Technology',
      issuer: 'Apple Inc.',
      isAvailable: true,
    },
    {
      name: 'Microsoft Corp. (MSFT)',
      type: 'STOCK' as const,
      symbol: 'MSFT',
      description: 'Technology company focused on software and cloud services',
      currentPrice: new Decimal(320.15),
      minimumInvestment: new Decimal(100),
      maximumInvestment: new Decimal(100000),
      currency: 'GBP',
      riskLevel: 'MEDIUM' as const,
      expectedReturn: new Decimal(9.2),
      category: 'Technology',
      issuer: 'Microsoft Corp.',
      isAvailable: true,
    },
    {
      name: 'Tesla Inc. (TSLA)',
      type: 'STOCK' as const,
      symbol: 'TSLA',
      description: 'Electric vehicle and clean energy company',
      currentPrice: new Decimal(245.3),
      minimumInvestment: new Decimal(100),
      maximumInvestment: new Decimal(100000),
      currency: 'GBP',
      riskLevel: 'HIGH' as const,
      expectedReturn: new Decimal(12.0),
      category: 'Automotive',
      issuer: 'Tesla Inc.',
      isAvailable: true,
    },
    {
      name: 'Gold ETF (GLD)',
      type: 'ETF' as const,
      symbol: 'GLD',
      description: 'SPDR Gold Trust ETF tracking gold prices',
      currentPrice: new Decimal(185.75),
      minimumInvestment: new Decimal(50),
      maximumInvestment: new Decimal(500000),
      currency: 'GBP',
      riskLevel: 'MEDIUM' as const,
      expectedReturn: new Decimal(6.8),
      category: 'Commodities',
      issuer: 'State Street',
      isAvailable: true,
    },
    {
      name: 'US Treasury Bond 10Y',
      type: 'BOND' as const,
      symbol: 'US10Y',
      description: '10-year US Treasury bond with fixed interest rate',
      currentPrice: new Decimal(98.5),
      minimumInvestment: new Decimal(1000),
      maximumInvestment: new Decimal(1000000),
      currency: 'GBP',
      riskLevel: 'LOW' as const,
      expectedReturn: new Decimal(4.2),
      category: 'Government',
      issuer: 'US Treasury',
      maturityDate: new Date('2034-01-01'),
      isAvailable: true,
    },
  ];

  // Clear existing marketplace items and create new ones
  await prisma.marketplaceItem.deleteMany({});
  await prisma.marketplaceItem.createMany({
    data: marketplaceItems,
  });

  // Created marketplace items - using console.warn for consistency
  console.warn('Created marketplace items');

  // Database seed completed successfully - using console.warn for consistency
  console.warn('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
