import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLogger } from '../logger/logger.service';
import { Logger } from 'pino';
import { StellarHorizonStreamService } from '../stellar/stellar-horizon-stream.service';
import * as os from 'os';

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  statusCode: number;
  timestamp: string;
  uptime: number;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      message: string;
    };
    stellar: {
      status: 'healthy' | 'unhealthy';
      message: string;
    };
    horizonStream: {
      status: 'connected' | 'disconnected' | 'disabled';
      message: string;
    };
    system: {
      memory: {
        used: number;
        total: number;
        percentUsed: number;
      };
      uptime: number;
    };
  };
}

@Injectable()
export class HealthService {
  private readonly logger: Logger;

  constructor(
    private readonly dataSource: DataSource,
    private readonly horizonStreamService: StellarHorizonStreamService,
    appLogger: AppLogger,
  ) {
    this.logger = appLogger.child({ module: HealthService.name });
  }

  liveness(): { status: 'ok'; statusCode: 200; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      statusCode: 200,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async check(): Promise<HealthCheckResult> {
    const dbStatus = await this.checkDatabase();
    const stellarStatus = await this.checkStellarNetwork();
    const horizonStreamStatus = this.checkHorizonStream();
    const systemStatus = this.checkSystem();

    const isHealthy = dbStatus.status === 'healthy' && stellarStatus.status === 'healthy';
    const isDegraded = !isHealthy && (dbStatus.status === 'healthy' || stellarStatus.status === 'healthy');

    const overallStatus = isHealthy ? 'ok' : isDegraded ? 'degraded' : 'unhealthy';
    const statusCode = isHealthy ? 200 : isDegraded ? 200 : 503;

    return {
      status: overallStatus,
      statusCode,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbStatus,
        stellar: stellarStatus,
        horizonStream: horizonStreamStatus,
        system: systemStatus,
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'healthy' | 'unhealthy';
    message: string;
  }> {
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        return { status: 'healthy', message: 'Database connection is healthy' };
      }
      this.logger.warn('Database not initialized');
      return { status: 'unhealthy', message: 'Database not initialized' };
    } catch (error) {
      this.logger.error(
        {
          err:
            error instanceof Error ? error : new Error('Database check failed'),
        },
        'Database health check failed',
      );
      return {
        status: 'unhealthy',
        message:
          error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private async checkStellarNetwork(): Promise<{
    status: 'healthy' | 'unhealthy';
    message: string;
  }> {
    try {
      const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${horizonUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { status: 'healthy', message: 'Stellar network is reachable' };
      }
      return { status: 'unhealthy', message: `Stellar health check returned ${response.status}` };
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error : new Error('Stellar check failed') },
        'Stellar health check failed',
      );
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Stellar network unreachable',
      };
    }
  }

  private checkHorizonStream(): {
    status: 'connected' | 'disconnected' | 'disabled';
    message: string;
  } {
    if (!process.env.STELLAR_MERCHANT_ACCOUNT_ID) {
      return { status: 'disabled', message: 'STELLAR_MERCHANT_ACCOUNT_ID not configured' };
    }
    if (this.horizonStreamService.connected) {
      return { status: 'connected', message: 'Horizon SSE stream is active' };
    }
    return { status: 'disconnected', message: 'Horizon SSE stream is not connected' };
  }

  private checkSystem(): {
    memory: { used: number; total: number; percentUsed: number };
    uptime: number;
  } {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const percentUsed = (usedMemory / totalMemory) * 100;

    return {
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentUsed: Math.round(percentUsed * 100) / 100,
      },
      uptime: process.uptime(),
    };
  }
}
