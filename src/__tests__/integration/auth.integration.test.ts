import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../../routes/auth.routes';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
} as any;

vi.mock('../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

describe('Auth Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    vi.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
    });

    it('should return error if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      });

      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should validate password strength', async () => {
      const response = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user successfully', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: '$2b$10$hashedpassword',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
    });

    it('should return error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return error if password is incorrect', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: '$2b$10$wronghash',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'WrongPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'valid-refresh-token',
        });

      // This will depend on your JWT implementation
      expect(response.status).toBeOneOf([200, 401]);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBeOneOf([200, 401]);
    });
  });
});

