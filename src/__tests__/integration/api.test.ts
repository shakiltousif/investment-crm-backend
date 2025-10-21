import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../index';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  portfolio: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  bankAccount: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  investment: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  $disconnect: vi.fn(),
} as any;

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// Mock JWT functions
vi.mock('../../middleware/auth', () => ({
  generateToken: vi.fn(() => 'mock-access-token'),
  generateRefreshToken: vi.fn(() => 'mock-refresh-token'),
  verifyToken: vi.fn((token) => {
    if (token === 'valid-token') {
      return { userId: 'user-1', email: 'test@example.com' };
    }
    throw new Error('Invalid token');
  }),
}));

describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user successfully', async () => {
        const userData = {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+1234567890',
        };

        const createdUser = {
          id: 'user-1',
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
        };

        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockPrisma.user.create.mockResolvedValue(createdUser);

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(201);

        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body.user.email).toBe(userData.email);
      });

      it('should return 409 for existing email', async () => {
        const userData = {
          email: 'existing@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe',
        };

        const existingUser = {
          id: 'user-1',
          email: userData.email,
        };

        mockPrisma.user.findUnique.mockResolvedValue(existingUser);

        const response = await request(app)
          .post('/api/auth/register')
          .send(userData)
          .expect(409);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('already exists');
      });

      it('should return 400 for invalid data', async () => {
        const invalidData = {
          email: 'invalid-email',
          password: '123', // Too short
          firstName: '',
          lastName: 'Doe',
        };

        const response = await request(app)
          .post('/api/auth/register')
          .send(invalidData)
          .expect(400);

        expect(response.body).toHaveProperty('message');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login successfully with valid credentials', async () => {
        const loginData = {
          email: 'test@example.com',
          password: 'password123',
        };

        const user = {
          id: 'user-1',
          email: loginData.email,
          firstName: 'John',
          lastName: 'Doe',
          password: 'hashed-password',
          isActive: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        };

        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.user.update.mockResolvedValue(user);

        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData)
          .expect(200);

        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body.user.email).toBe(loginData.email);
      });

      it('should return 401 for invalid credentials', async () => {
        const loginData = {
          email: 'test@example.com',
          password: 'wrongpassword',
        };

        mockPrisma.user.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/auth/login')
          .send(loginData)
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid credentials');
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should refresh token successfully', async () => {
        const refreshData = {
          refreshToken: 'valid-refresh-token',
        };

        const user = {
          id: 'user-1',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
        };

        mockPrisma.user.findFirst.mockResolvedValue(user);

        const response = await request(app)
          .post('/api/auth/refresh')
          .send(refreshData)
          .expect(200);

        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
      });

      it('should return 401 for invalid refresh token', async () => {
        const refreshData = {
          refreshToken: 'invalid-refresh-token',
        };

        mockPrisma.user.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/auth/refresh')
          .send(refreshData)
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid refresh token');
      });
    });
  });

  describe('Portfolio Endpoints', () => {
    const authHeaders = {
      Authorization: 'Bearer valid-token',
    };

    describe('GET /api/portfolios', () => {
      it('should return user portfolios', async () => {
        const portfolios = [
          {
            id: 'portfolio-1',
            name: 'Growth Portfolio',
            description: 'High growth investments',
            totalValue: 10000,
            totalInvested: 8000,
            totalGain: 2000,
            gainPercentage: 25,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockPrisma.portfolio.findMany.mockResolvedValue(portfolios);

        const response = await request(app)
          .get('/api/portfolios')
          .set(authHeaders)
          .expect(200);

        expect(response.body).toEqual(portfolios);
      });

      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/portfolios')
          .expect(401);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Authentication required');
      });
    });

    describe('POST /api/portfolios', () => {
      it('should create a new portfolio', async () => {
        const portfolioData = {
          name: 'New Portfolio',
          description: 'A new investment portfolio',
        };

        const createdPortfolio = {
          id: 'portfolio-1',
          userId: 'user-1',
          ...portfolioData,
          totalValue: 0,
          totalInvested: 0,
          totalGain: 0,
          gainPercentage: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.portfolio.create.mockResolvedValue(createdPortfolio);

        const response = await request(app)
          .post('/api/portfolios')
          .set(authHeaders)
          .send(portfolioData)
          .expect(201);

        expect(response.body).toEqual(createdPortfolio);
      });

      it('should return 400 for invalid data', async () => {
        const invalidData = {
          name: '', // Empty name
          description: 'A portfolio without a name',
        };

        const response = await request(app)
          .post('/api/portfolios')
          .set(authHeaders)
          .send(invalidData)
          .expect(400);

        expect(response.body).toHaveProperty('message');
      });
    });

    describe('GET /api/portfolios/:id', () => {
      it('should return a specific portfolio', async () => {
        const portfolioId = 'portfolio-1';
        const portfolio = {
          id: portfolioId,
          userId: 'user-1',
          name: 'Growth Portfolio',
          description: 'High growth investments',
          totalValue: 10000,
          totalInvested: 8000,
          totalGain: 2000,
          gainPercentage: 25,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);

        const response = await request(app)
          .get(`/api/portfolios/${portfolioId}`)
          .set(authHeaders)
          .expect(200);

        expect(response.body).toEqual(portfolio);
      });

      it('should return 404 for non-existent portfolio', async () => {
        const portfolioId = 'non-existent';

        mockPrisma.portfolio.findUnique.mockResolvedValue(null);

        const response = await request(app)
          .get(`/api/portfolios/${portfolioId}`)
          .set(authHeaders)
          .expect(404);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('not found');
      });
    });

    describe('PUT /api/portfolios/:id', () => {
      it('should update a portfolio', async () => {
        const portfolioId = 'portfolio-1';
        const updateData = {
          name: 'Updated Portfolio',
          description: 'Updated description',
        };

        const updatedPortfolio = {
          id: portfolioId,
          userId: 'user-1',
          ...updateData,
          totalValue: 10000,
          totalInvested: 8000,
          totalGain: 2000,
          gainPercentage: 25,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.portfolio.findUnique.mockResolvedValue({ id: portfolioId, userId: 'user-1' });
        mockPrisma.portfolio.update.mockResolvedValue(updatedPortfolio);

        const response = await request(app)
          .put(`/api/portfolios/${portfolioId}`)
          .set(authHeaders)
          .send(updateData)
          .expect(200);

        expect(response.body).toEqual(updatedPortfolio);
      });
    });

    describe('DELETE /api/portfolios/:id', () => {
      it('should delete a portfolio', async () => {
        const portfolioId = 'portfolio-1';

        mockPrisma.portfolio.findUnique.mockResolvedValue({ id: portfolioId, userId: 'user-1' });
        mockPrisma.portfolio.delete.mockResolvedValue({});

        const response = await request(app)
          .delete(`/api/portfolios/${portfolioId}`)
          .set(authHeaders)
          .expect(204);

        expect(response.body).toEqual({});
      });
    });
  });

  describe('Bank Account Endpoints', () => {
    const authHeaders = {
      Authorization: 'Bearer valid-token',
    };

    describe('GET /api/bank-accounts', () => {
      it('should return user bank accounts', async () => {
        const bankAccounts = [
          {
            id: 'account-1',
            userId: 'user-1',
            accountHolderName: 'John Doe',
            accountNumber: '1234567890',
            bankName: 'Test Bank',
            accountType: 'Savings',
            currency: 'USD',
            balance: 10000,
            isVerified: true,
            isPrimary: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockPrisma.bankAccount.findMany.mockResolvedValue(bankAccounts);

        const response = await request(app)
          .get('/api/bank-accounts')
          .set(authHeaders)
          .expect(200);

        expect(response.body).toEqual(bankAccounts);
      });
    });

    describe('POST /api/bank-accounts', () => {
      it('should create a new bank account', async () => {
        const accountData = {
          accountHolderName: 'John Doe',
          accountNumber: '1234567890',
          bankName: 'Test Bank',
          accountType: 'Savings',
          currency: 'USD',
        };

        const createdAccount = {
          id: 'account-1',
          userId: 'user-1',
          ...accountData,
          balance: 0,
          isVerified: false,
          isPrimary: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.bankAccount.count.mockResolvedValue(0);
        mockPrisma.bankAccount.create.mockResolvedValue(createdAccount);

        const response = await request(app)
          .post('/api/bank-accounts')
          .set(authHeaders)
          .send(accountData)
          .expect(201);

        expect(response.body).toEqual(createdAccount);
      });

      it('should return 409 for duplicate account number', async () => {
        const accountData = {
          accountHolderName: 'John Doe',
          accountNumber: '1234567890',
          bankName: 'Test Bank',
          accountType: 'Savings',
          currency: 'USD',
        };

        mockPrisma.bankAccount.count.mockResolvedValue(1);

        const response = await request(app)
          .post('/api/bank-accounts')
          .set(authHeaders)
          .send(accountData)
          .expect(409);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('already exists');
      });
    });

    describe('POST /api/bank-accounts/:id/verify', () => {
      it('should verify a bank account', async () => {
        const accountId = 'account-1';

        const verifiedAccount = {
          id: accountId,
          userId: 'user-1',
          isVerified: true,
          verifiedAt: new Date(),
        };

        mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId: 'user-1' });
        mockPrisma.bankAccount.update.mockResolvedValue(verifiedAccount);

        const response = await request(app)
          .post(`/api/bank-accounts/${accountId}/verify`)
          .set(authHeaders)
          .expect(200);

        expect(response.body).toEqual(verifiedAccount);
      });
    });

    describe('POST /api/bank-accounts/:id/set-primary', () => {
      it('should set a bank account as primary', async () => {
        const accountId = 'account-1';

        const primaryAccount = {
          id: accountId,
          userId: 'user-1',
          isPrimary: true,
        };

        mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId: 'user-1' });
        mockPrisma.bankAccount.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.bankAccount.update.mockResolvedValue(primaryAccount);

        const response = await request(app)
          .post(`/api/bank-accounts/${accountId}/set-primary`)
          .set(authHeaders)
          .expect(200);

        expect(response.body).toEqual(primaryAccount);
      });
    });
  });

  describe('Investment Endpoints', () => {
    const authHeaders = {
      Authorization: 'Bearer valid-token',
    };

    describe('GET /api/investments', () => {
      it('should return user investments with pagination', async () => {
        const investments = [
          {
            id: 'investment-1',
            userId: 'user-1',
            portfolioId: 'portfolio-1',
            name: 'Apple Inc.',
            symbol: 'AAPL',
            type: 'STOCK',
            quantity: 10,
            purchasePrice: 150,
            currentPrice: 160,
            totalValue: 1600,
            totalInvested: 1500,
            totalGain: 100,
            gainPercentage: 6.67,
            purchaseDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockPrisma.investment.findMany.mockResolvedValue(investments);
        mockPrisma.investment.count.mockResolvedValue(1);

        const response = await request(app)
          .get('/api/investments')
          .set(authHeaders)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.data).toEqual(investments);
        expect(response.body.pagination.total).toBe(1);
      });

      it('should filter investments by portfolio', async () => {
        const filters = {
          portfolioId: 'portfolio-1',
          limit: 10,
          offset: 0,
        };

        mockPrisma.investment.findMany.mockResolvedValue([]);
        mockPrisma.investment.count.mockResolvedValue(0);

        const response = await request(app)
          .get('/api/investments')
          .set(authHeaders)
          .query(filters)
          .expect(200);

        expect(response.body.data).toEqual([]);
      });
    });

    describe('POST /api/investments/buy', () => {
      it('should buy an investment successfully', async () => {
        const buyData = {
          investmentId: 'investment-1',
          portfolioId: 'portfolio-1',
          quantity: 10,
          purchasePrice: 150,
          bankAccountId: 'account-1',
        };

        const portfolio = {
          id: 'portfolio-1',
          userId: 'user-1',
          totalValue: 1000,
          totalInvested: 800,
        };

        const bankAccount = {
          id: 'account-1',
          userId: 'user-1',
          balance: 2000,
          isVerified: true,
        };

        const investment = {
          id: 'investment-1',
          name: 'Apple Inc.',
          symbol: 'AAPL',
          type: 'STOCK',
        };

        const createdInvestment = {
          id: 'investment-1',
          userId: 'user-1',
          portfolioId: 'portfolio-1',
          investmentId: 'investment-1',
          quantity: 10,
          purchasePrice: 150,
          currentPrice: 150,
          totalValue: 1500,
          totalInvested: 1500,
          totalGain: 0,
          gainPercentage: 0,
          purchaseDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
        mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);
        mockPrisma.investment.findUnique.mockResolvedValue(investment);
        mockPrisma.investment.create.mockResolvedValue(createdInvestment);
        mockPrisma.transaction.create.mockResolvedValue({});
        mockPrisma.portfolio.update.mockResolvedValue({});
        mockPrisma.bankAccount.update.mockResolvedValue({});

        const response = await request(app)
          .post('/api/investments/buy')
          .set(authHeaders)
          .send(buyData)
          .expect(201);

        expect(response.body).toEqual(createdInvestment);
      });

      it('should return 400 for insufficient funds', async () => {
        const buyData = {
          investmentId: 'investment-1',
          portfolioId: 'portfolio-1',
          quantity: 10,
          purchasePrice: 150,
          bankAccountId: 'account-1',
        };

        const portfolio = {
          id: 'portfolio-1',
          userId: 'user-1',
          totalValue: 1000,
          totalInvested: 800,
        };

        const bankAccount = {
          id: 'account-1',
          userId: 'user-1',
          balance: 100, // Insufficient balance
          isVerified: true,
        };

        mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
        mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);

        const response = await request(app)
          .post('/api/investments/buy')
          .set(authHeaders)
          .send(buyData)
          .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Insufficient funds');
      });
    });

    describe('POST /api/investments/sell', () => {
      it('should sell an investment successfully', async () => {
        const sellData = {
          investmentId: 'investment-1',
          quantity: 5,
          sellPrice: 160,
          bankAccountId: 'account-1',
        };

        const investment = {
          id: 'investment-1',
          userId: 'user-1',
          portfolioId: 'portfolio-1',
          quantity: 10,
          purchasePrice: 150,
          currentPrice: 160,
          totalValue: 1600,
          totalInvested: 1500,
        };

        const bankAccount = {
          id: 'account-1',
          userId: 'user-1',
          balance: 1000,
          isVerified: true,
        };

        const updatedInvestment = {
          ...investment,
          quantity: 5,
          totalValue: 800,
          totalInvested: 750,
          totalGain: 50,
          gainPercentage: 6.67,
        };

        mockPrisma.investment.findUnique.mockResolvedValue(investment);
        mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);
        mockPrisma.investment.update.mockResolvedValue(updatedInvestment);
        mockPrisma.transaction.create.mockResolvedValue({});
        mockPrisma.bankAccount.update.mockResolvedValue({});

        const response = await request(app)
          .post('/api/investments/sell')
          .set(authHeaders)
          .send(sellData)
          .expect(200);

        expect(response.body).toEqual(updatedInvestment);
      });

      it('should return 400 for insufficient quantity', async () => {
        const sellData = {
          investmentId: 'investment-1',
          quantity: 15, // More than available
          sellPrice: 160,
          bankAccountId: 'account-1',
        };

        const investment = {
          id: 'investment-1',
          userId: 'user-1',
          portfolioId: 'portfolio-1',
          quantity: 10, // Only 10 available
          purchasePrice: 150,
          currentPrice: 160,
          totalValue: 1600,
          totalInvested: 1500,
        };

        mockPrisma.investment.findUnique.mockResolvedValue(investment);

        const response = await request(app)
          .post('/api/investments/sell')
          .set(authHeaders)
          .send(sellData)
          .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Insufficient quantity');
      });
    });
  });

  describe('Transaction Endpoints', () => {
    const authHeaders = {
      Authorization: 'Bearer valid-token',
    };

    describe('GET /api/transactions', () => {
      it('should return user transactions with pagination', async () => {
        const transactions = [
          {
            id: 'transaction-1',
            userId: 'user-1',
            type: 'BUY',
            amount: 1500,
            currency: 'USD',
            status: 'COMPLETED',
            description: 'Purchase of Apple Inc.',
            transactionDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockPrisma.transaction.findMany.mockResolvedValue(transactions);
        mockPrisma.transaction.count.mockResolvedValue(1);

        const response = await request(app)
          .get('/api/transactions')
          .set(authHeaders)
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.data).toEqual(transactions);
        expect(response.body.pagination.total).toBe(1);
      });

      it('should filter transactions by type and date range', async () => {
        const filters = {
          type: 'BUY',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          limit: 10,
          offset: 0,
        };

        mockPrisma.transaction.findMany.mockResolvedValue([]);
        mockPrisma.transaction.count.mockResolvedValue(0);

        const response = await request(app)
          .get('/api/transactions')
          .set(authHeaders)
          .query(filters)
          .expect(200);

        expect(response.body.data).toEqual([]);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });

    it('should return 500 for server errors', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(500);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Internal server error');
    });
  });
});
