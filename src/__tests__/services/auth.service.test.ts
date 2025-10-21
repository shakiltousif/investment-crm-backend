import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../../services/auth.service';
import { ConflictError, AuthenticationError, ValidationError } from '../../middleware/errorHandler';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
} as any;

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

// Mock JWT functions
vi.mock('../src/middleware/auth', () => ({
  generateToken: vi.fn(() => 'mock-access-token'),
  generateRefreshToken: vi.fn(() => 'mock-refresh-token'),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let bcrypt: any;

  beforeEach(async () => {
    authService = new AuthService();
    bcrypt = await import('bcryptjs');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
      };

      const hashedPassword = 'hashed-password';
      const createdUser = {
        id: 'user-1',
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue(hashedPassword);
      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await authService.register(userData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phoneNumber: userData.phoneNumber,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
      expect(result).toEqual({
        user: createdUser,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should throw ConflictError if user already exists', async () => {
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

      await expect(authService.register(userData)).rejects.toThrow(ConflictError);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during registration', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(authService.register(userData)).rejects.toThrow('Database error');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
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
      bcrypt.compare.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue(user);

      const result = await authService.login(loginData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginData.password, user.password);
      expect(result).toEqual({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should throw AuthenticationError for invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const user = {
        id: 'user-1',
        email: loginData.email,
        password: 'hashed-password',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(false);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for inactive user', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user = {
        id: 'user-1',
        email: loginData.email,
        password: 'hashed-password',
        isActive: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for locked account', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user = {
        id: 'user-1',
        email: loginData.email,
        password: 'hashed-password',
        isActive: true,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 3600000), // 1 hour from now
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(authService.login(loginData)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const userId = 'user-1';

      const user = {
        id: userId,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockPrisma.user.findFirst.mockResolvedValue(user);

      const result = await authService.refreshToken(refreshToken);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should throw AuthenticationError for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';

      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      const userId = 'user-1';

      mockPrisma.user.update.mockResolvedValue({});

      await authService.logout(userId);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          lastLoginAt: expect.any(Date),
        },
      });
    });
  });
});
