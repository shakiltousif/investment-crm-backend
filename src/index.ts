import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import jwt from 'jsonwebtoken';

import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
// import { rateLimiter } from './middleware/rateLimiter.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import bankAccountRoutes from './routes/bankAccount.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import investmentRoutes from './routes/investment.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import quotesRoutes from './routes/quotes.routes.js';
import depositRoutes from './routes/deposit.routes.js';
import withdrawalRoutes from './routes/withdrawal.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import twoFactorRoutes from './routes/twoFactor.routes.js';
import auditLogRoutes from './routes/auditLog.routes.js';
import adminRoutes from './routes/admin.routes.js';
import documentRoutes from './routes/document.routes.js';
import supportRoutes from './routes/support.routes.js';
import investmentProductRoutes from './routes/investmentProduct.routes.js';
import reportRoutes from './routes/report.routes.js';
import emailSettingsRoutes from './routes/emailSettings.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import notificationSettingsRoutes from './routes/notificationSettings.routes.js';
import problemReportRoutes from './routes/problemReport.routes.js';
import smtpConfigRoutes from './routes/smtpConfig.routes.js';

// Load environment variables
dotenv.config();

// Configure CORS origins
// Support comma-separated list of origins or single origin
const getAllowedOrigins = (): string[] => {
  const corsOrigin = process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL;

  if (!corsOrigin) {
    return ['http://localhost:3000'];
  }

  // If comma-separated, split into array; otherwise return single item array
  if (corsOrigin.includes(',')) {
    return corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return [corsOrigin.trim()];
};

const allowedOrigins = getAllowedOrigins();

// Log CORS configuration on startup
logger.info(`CORS allowed origins: ${JSON.stringify(allowedOrigins)}`);

// CORS origin function that properly handles multiple origins
const corsOriginFunction = (
  origin: string | undefined,
  callback: (err: Error | null, origin?: string | boolean) => void
): void => {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) {
    return callback(null, true);
  }

  // Check if the origin is in the allowed list
  if (allowedOrigins.includes(origin)) {
    // Return the origin string so the header is set correctly
    return callback(null, origin);
  }

  // Reject the request
  callback(new Error('Not allowed by CORS'));
};

const app: Express = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOriginFunction,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT ?? 3001;
const NODE_ENV = process.env.NODE_ENV ?? 'development';

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: corsOriginFunction,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Request logging
app.use(requestLogger);

// Rate limiting - DISABLED FOR DEVELOPMENT
// app.use(rateLimiter);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/investment-products', investmentProductRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-settings', notificationSettingsRoutes);
app.use('/api/smtp-config', smtpConfigRoutes);
app.use('/api/problem-reports', problemReportRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
  });
});

// Error handling middleware
app.use(errorHandler);

// Socket.io connection handling with authentication
io.use((socket, next) => {
  const token =
    socket.handshake.auth.token ?? socket.handshake.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new Error('JWT_SECRET is not defined'));
  }

  try {
    const decoded = jwt.verify(token, secret) as { userId: string; email: string };
    socket.data.userId = decoded.userId;
    socket.data.email = decoded.email;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  logger.info(`Client connected: ${socket.id} (User: ${userId})`);

  // Join user's personal room for targeted notifications
  if (userId) {
    void socket.join(`user:${userId}`);
    logger.info(`User ${userId} joined room: user:${userId}`);
  }

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id} (User: ${userId})`);
  });
});

// Start server (skip in test environment)
if (NODE_ENV !== 'test' && !process.env.VITEST) {
  // Perform health checks before starting the server
  void (async (): Promise<void> => {
    try {
      const { performHealthChecks } = await import('./lib/healthCheck.js');
      await performHealthChecks();

      // Health checks passed, start the server
      httpServer.listen(PORT, () => {
        logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
        logger.info(`API URL: ${process.env.API_URL ?? `http://localhost:${PORT}`}`);
      });
    } catch (error) {
      logger.error('Failed to perform health checks:', error);
      process.exit(1);
    }
  })();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, io };
