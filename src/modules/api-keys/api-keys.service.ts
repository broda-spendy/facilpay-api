import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { ApiKey, ApiKeyEnvironment, ApiKeyScope } from './api-key.entity';
import { ApiKeyUsage } from './api-key-usage.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { GetApiKeyUsageDto } from './dto/get-api-key-usage.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { isIpAllowed } from '../merchants/ip-utils';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(ApiKeyUsage)
    private readonly apiKeyUsageRepository: Repository<ApiKeyUsage>,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    userId: string,
    dto: CreateApiKeyDto,
    actorId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ apiKey: ApiKey; plaintext: string }> {
    const environment = dto.environment ?? ApiKeyEnvironment.LIVE;
    const rawToken = randomBytes(32).toString('hex');
    const prefix = environment === ApiKeyEnvironment.LIVE ? 'fp_live_' : 'fp_test_';
    const plaintext = `${prefix}${rawToken}`;
    const keyHash = createHash('sha256').update(plaintext).digest('hex');
    const keyPrefix = plaintext.slice(0, 12);

    const apiKey = this.apiKeyRepository.create({
      name: dto.name,
      keyHash,
      keyPrefix,
      userId,
      scope: dto.scope ?? ApiKeyScope.READ,
      scopes: dto.scopes || [],
      environment,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      lastUsedAt: null,
      isActive: true,
      rateLimitLimit: dto.rateLimitLimit ?? null,
      rateLimitTtl: dto.rateLimitTtl ?? null,
      allowedIps: dto.allowedIps ?? [],
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    await this.auditLogsService.record({
      actorId: actorId ?? userId,
      actorType: 'user',
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: saved.id,
      ipAddress,
      userAgent,
      metadata: {
        name: dto.name,
        scope: dto.scope ?? ApiKeyScope.READ,
        scopes: dto.scopes || [],
        environment,
        keyPrefix: saved.keyPrefix,
      },
    });

    return { apiKey: saved, plaintext };
  }

  async findAllForUser(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, userId: string): Promise<ApiKey> {
    const key = await this.apiKeyRepository.findOne({
      where: { id, userId, isActive: true },
    });

    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return key;
  }

  async revoke(id: string, userId: string, actorId?: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({ where: { id, userId } });
    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }
    key.isActive = false;
    await this.apiKeyRepository.save(key);

    await this.auditLogsService.record({
      actorId: actorId ?? userId,
      actorType: 'user',
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: id,
      ipAddress,
      userAgent,
      metadata: { name: key.name, keyPrefix: key.keyPrefix },
    });
  }

  async update(id: string, userId: string, dto: UpdateApiKeyDto): Promise<ApiKey> {
    const key = await this.apiKeyRepository.findOne({ where: { id, userId, isActive: true } });
    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }
    if (dto.name !== undefined) key.name = dto.name;
    if (dto.scope !== undefined) key.scope = dto.scope;
    if (dto.rateLimitLimit !== undefined) key.rateLimitLimit = dto.rateLimitLimit;
    if (dto.rateLimitTtl !== undefined) key.rateLimitTtl = dto.rateLimitTtl;
    if (dto.allowedIps !== undefined) key.allowedIps = dto.allowedIps;
    return this.apiKeyRepository.save(key);
  }

  async rotate(id: string, userId: string, actorId?: string, ipAddress?: string, userAgent?: string): Promise<{ apiKey: ApiKey; plaintext: string }> {
    const key = await this.apiKeyRepository.findOne({ where: { id, userId, isActive: true } });
    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }
    key.isActive = false;
    await this.apiKeyRepository.save(key);

    const rawToken = randomBytes(32).toString('hex');
    const prefix = key.environment === ApiKeyEnvironment.LIVE ? 'fp_live_' : 'fp_test_';
    const plaintext = `${prefix}${rawToken}`;
    const newHash = createHash('sha256').update(plaintext).digest('hex');

    const newKey = this.apiKeyRepository.create({
      name: key.name,
      keyHash: newHash,
      keyPrefix: plaintext.slice(0, 12),
      userId,
      scope: key.scope,
      scopes: key.scopes,
      environment: key.environment,
      expiresAt: key.expiresAt,
      lastUsedAt: null,
      isActive: true,
      rateLimitLimit: key.rateLimitLimit,
      rateLimitTtl: key.rateLimitTtl,
      allowedIps: key.allowedIps,
    });
    const saved = await this.apiKeyRepository.save(newKey);

    await this.auditLogsService.record({
      actorId: actorId ?? userId,
      actorType: 'user',
      action: 'api_key.rotated',
      resourceType: 'api_key',
      resourceId: id,
      ipAddress,
      userAgent,
      metadata: {
        name: key.name,
        scope: key.scope,
        scopes: key.scopes,
        environment: key.environment,
        oldKeyPrefix: key.keyPrefix,
        newKeyPrefix: saved.keyPrefix,
      },
    });

    return { apiKey: saved, plaintext };
  }

  async validateKey(plaintext: string, sourceIp?: string): Promise<ApiKey> {
    const keyHash = createHash('sha256').update(plaintext).digest('hex');
    const key = await this.apiKeyRepository.findOne({ where: { keyHash, isActive: true } });

    if (!key) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Check IP allowlist if configured and source IP is available
    if (sourceIp && key.allowedIps?.length > 0) {
      if (!isIpAllowed(sourceIp, key.allowedIps)) {
        throw new UnauthorizedException(
          `API key access denied from IP ${sourceIp}. This key is restricted to specific IP ranges.`,
        );
      }
    }

    key.lastUsedAt = new Date();
    await this.apiKeyRepository.save(key);

    return key;
  }

  async recordUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    sourceIp: string | null,
    userAgent: string | null,
    statusCode?: number,
  ): Promise<void> {
    const usage = this.apiKeyUsageRepository.create({
      apiKeyId,
      endpoint,
      method,
      sourceIp,
      userAgent,
      statusCode: statusCode ?? null,
    });

    await this.apiKeyUsageRepository.save(usage);
  }

  async getUsageHistory(
    apiKeyId: string,
    userId: string,
    dto: GetApiKeyUsageDto,
  ): Promise<PaginatedResult<ApiKeyUsage>> {
    // Verify the API key belongs to the user
    const key = await this.apiKeyRepository.findOne({
      where: { id: apiKeyId, userId },
    });

    if (!key) {
      throw new NotFoundException(`API key with ID ${apiKeyId} not found`);
    }

    const query = this.apiKeyUsageRepository
      .createQueryBuilder('usage')
      .where('usage.apiKeyId = :apiKeyId', { apiKeyId });

    if (dto.from && dto.to) {
      query.andWhere('usage.createdAt BETWEEN :from AND :to', {
        from: new Date(dto.from),
        to: new Date(dto.to),
      });
    } else if (dto.from) {
      query.andWhere('usage.createdAt >= :from', { from: new Date(dto.from) });
    } else if (dto.to) {
      query.andWhere('usage.createdAt <= :to', { to: new Date(dto.to) });
    }

    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    query.orderBy('usage.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Prune old usage records to prevent unbounded storage growth.
   * Runs daily and removes records older than the configured retention period.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async pruneOldUsageRecords(): Promise<void> {
    const retentionDays = this.configService.get<number>(
      'API_KEY_USAGE_RETENTION_DAYS',
      90,
    );
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.apiKeyUsageRepository.delete({
      createdAt: LessThan(cutoffDate),
    });

    if (result.affected && result.affected > 0) {
      console.log(
        `Pruned ${result.affected} API key usage records older than ${retentionDays} days`,
      );
    }
  }
}
