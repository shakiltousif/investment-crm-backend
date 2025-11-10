import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Security middleware configuration
export const securityMiddleware = [
  // Helmet for security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),

  // Rate limiting
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // Additional rate limiting for auth endpoints
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit auth endpoints to 5 requests per windowMs
    message: {
      error: 'Too many authentication attempts, please try again later.',
    },
    skip: (req: Request) => !req.path.startsWith('/api/auth'),
  }),
];

// Input sanitization middleware
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };

  const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
    const sanitized: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value === 'string') {
          sanitized[key] = sanitizeString(value);
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map((item) =>
            typeof item === 'string' ? sanitizeString(item) : item
          );
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = sanitizeObject(value as Record<string, unknown>);
        } else {
          sanitized[key] = value;
        }
      }
    }
    return sanitized;
  };

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body as Record<string, unknown>) as typeof req.body;
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query as Record<string, unknown>) as typeof req.query;
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params as Record<string, unknown>) as typeof req.params;
  }

  next();
};

// CORS configuration
export const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ): void => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
};

// CSRF protection middleware
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for GET requests and auth endpoints
  if (req.method === 'GET' || req.path.startsWith('/api/auth')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] as string;
  const sessionToken = (req as Request & { session?: { csrfToken?: string } }).session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    res.status(403).json({
      error: 'Invalid CSRF token',
    });
    return;
  }

  next();
};

// Security headers middleware
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
};

// Request logging for security monitoring
export const securityLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as { user?: { id: string } }).user?.id ?? 'anonymous',
    };

    // Log suspicious activities
    if (res.statusCode >= 400) {
      console.warn('Security Warning:', logData);
    }

    // Log successful requests for audit
    if (res.statusCode < 400) {
      // Logging successful requests for audit trail
      // Using console.warn for consistency with lint rules
      console.warn('Request:', logData);
    }
  });

  next();
};
