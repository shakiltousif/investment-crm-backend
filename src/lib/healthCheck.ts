import { prisma } from './prisma.js';
import { logger } from '../config/logger.js';

interface HealthCheckResult {
  success: boolean;
  service: string;
  error?: string;
}

/**
 * Check PostgreSQL database connection
 */
async function checkPostgreSQL(
  maxRetries: number = 4,
  retryDelay: number = 2000
): Promise<HealthCheckResult> {
  const service = 'PostgreSQL';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try to connect and run a simple query
      await prisma.$queryRaw`SELECT 1`;
      logger.info(`✓ ${service} connection successful`);
      return { success: true, service };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt < maxRetries) {
        logger.warn(
          `✗ ${service} connection attempt ${attempt}/${maxRetries} failed: ${errorMessage}. Retrying in ${retryDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        // Exponential backoff
        retryDelay = Math.min(retryDelay * 1.5, 10000);
      } else {
        logger.error(
          `✗ ${service} connection failed after ${maxRetries} attempts: ${errorMessage}`
        );
        return { success: false, service, error: errorMessage };
      }
    }
  }

  return { success: false, service, error: 'Max retries exceeded' };
}

/**
 * Check Redis connection using TCP connection test
 */
async function checkRedis(
  maxRetries: number = 4,
  retryDelay: number = 2000
): Promise<HealthCheckResult> {
  const service = 'Redis';
  const redisHost = process.env.REDIS_HOST ?? 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);

  // Check if Redis should be tested
  // If REDIS_URL or REDIS_HOST is explicitly set, Redis is required
  // Otherwise, check if using default localhost:6379 (common in docker-compose)
  const hasExplicitConfig = (process.env.REDIS_URL ?? process.env.REDIS_HOST) !== undefined;
  const isDefaultConfig = !hasExplicitConfig && redisHost === 'localhost' && redisPort === 6379;
  const shouldCheckRedis = hasExplicitConfig || isDefaultConfig;

  if (!shouldCheckRedis) {
    logger.info(
      `⚠ ${service} not configured (REDIS_URL/REDIS_HOST not set), skipping health check`
    );
    return { success: true, service: `${service} (skipped - not configured)` };
  }

  // Try to connect using net.Socket for a simple TCP connection test
  const net = await import('net');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connected = await new Promise<boolean>((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = 5000; // 5 second timeout

        socket.setTimeout(timeout);

        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });

        socket.once('timeout', () => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        });

        socket.once('error', (err) => {
          socket.destroy();
          reject(err);
        });

        try {
          socket.connect(redisPort, redisHost);
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      });

      if (connected) {
        // Try to send a PING command to verify Redis is responding
        const redisSocket = new net.Socket();
        const timeout = 5000;

        redisSocket.setTimeout(timeout);

        const pingResult = await new Promise<string>((resolve, reject) => {
          let response = '';

          redisSocket.once('connect', () => {
            // Send PING command
            redisSocket.write('PING\r\n');
          });

          redisSocket.on('data', (data) => {
            response += data.toString();
            // Redis responds with +PONG\r\n
            if (response.includes('PONG') || response.includes('+PONG')) {
              redisSocket.destroy();
              resolve('PONG');
            }
          });

          redisSocket.once('timeout', () => {
            redisSocket.destroy();
            reject(new Error('Redis PING timeout'));
          });

          redisSocket.once('error', (err) => {
            redisSocket.destroy();
            reject(err);
          });

          try {
            redisSocket.connect(redisPort, redisHost);
          } catch (err) {
            redisSocket.destroy();
            reject(err);
          }
        });

        if (pingResult) {
          logger.info(`✓ ${service} connection successful`);
          return { success: true, service };
        } else {
          throw new Error('Redis did not respond with PONG');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt < maxRetries) {
        logger.warn(
          `✗ ${service} connection attempt ${attempt}/${maxRetries} failed: ${errorMessage}. Retrying in ${retryDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        // Exponential backoff
        retryDelay = Math.min(retryDelay * 1.5, 10000);
      } else {
        logger.error(
          `✗ ${service} connection failed after ${maxRetries} attempts: ${errorMessage}`
        );
        return { success: false, service, error: errorMessage };
      }
    }
  }

  return { success: false, service, error: 'Max retries exceeded' };
}

/**
 * Perform all health checks before starting the server
 */
export async function performHealthChecks(): Promise<void> {
  logger.info('🔍 Starting health checks for required services...');
  logger.info('');

  const results: HealthCheckResult[] = [];

  // Check PostgreSQL (required)
  const postgresResult = await checkPostgreSQL();
  results.push(postgresResult);

  // Check Redis (optional if not configured)
  const redisResult = await checkRedis();
  results.push(redisResult);

  logger.info('');

  // Check if any required services failed
  const failedServices = results.filter((r) => !r.success && !r.service.includes('skipped'));

  if (failedServices.length > 0) {
    logger.error('');
    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('❌ HEALTH CHECKS FAILED - SERVER WILL NOT START');
    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('');
    logger.error('The following services are not ready:');
    logger.error('');

    failedServices.forEach((result) => {
      logger.error(`  ✗ ${result.service}`);
      logger.error(`    Error: ${result.error ?? 'Unknown error'}`);
      logger.error('');
    });

    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('HOW TO FIX:');
    logger.error('');

    if (failedServices.some((r) => r.service === 'PostgreSQL')) {
      logger.error('PostgreSQL:');
      logger.error('  1. Ensure PostgreSQL is running');
      logger.error('  2. Check DATABASE_URL environment variable');
      logger.error('  3. For Docker: docker-compose up -d postgres');
      logger.error('  4. Wait for PostgreSQL to be fully ready');
      logger.error('');
    }

    if (failedServices.some((r) => r.service === 'Redis')) {
      logger.error('Redis:');
      logger.error('  1. Ensure Redis is running');
      logger.error('  2. Check REDIS_HOST and REDIS_PORT environment variables');
      logger.error('  3. For Docker: docker-compose up -d redis');
      logger.error('  4. Wait for Redis to be fully ready');
      logger.error('');
    }

    logger.error('═══════════════════════════════════════════════════════════════');
    logger.error('');

    // Exit with error code
    process.exit(1);
  }

  logger.info('✅ All health checks passed! Starting server...');
  logger.info('');
}
