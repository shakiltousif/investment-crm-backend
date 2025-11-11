import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from './errorHandler.js';
import { prisma } from '../lib/prisma.js';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    const decoded = jwt.verify(token, secret) as { userId: string; email: string };

    // Fetch user from database to get role
    let user: { id: string; email: string; role?: string; isActive: boolean } | null;

    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });
    } catch (error: unknown) {
      // Fallback if role column doesn't exist yet (database not migrated)
      if (error instanceof Error && error.message?.includes('does not exist')) {
        user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        });
        if (user) {
          user = { ...user, role: 'CLIENT' };
        }
      } else {
        throw error;
      }
    }

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    req.userId = user.id;
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    }
    throw error;
  }
};

/**
 * Middleware to require admin role
 */
export const requireAdmin = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN') {
    throw new AuthorizationError('Admin access required');
  }
  next();
};

/**
 * Helper to check if user has specific role
 */
export const requireRole = (role: string) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      throw new AuthorizationError(`Access denied. Required role: ${role}`);
    }
    next();
  };
};

export const generateToken = (userId: string, email: string): string => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRY ?? '7d';

  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
  return jwt.sign({ userId, email }, secret, options);
};

export const generateRefreshToken = (userId: string): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiresIn = process.env.JWT_REFRESH_EXPIRY ?? '30d';

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined');
  }

  const options: SignOptions = { expiresIn: expiresIn as SignOptions['expiresIn'] };
  return jwt.sign({ userId }, secret, options);
};

export const verifyRefreshToken = (token: string): { userId: string } => {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined');
  }

  return jwt.verify(token, secret) as { userId: string };
};
