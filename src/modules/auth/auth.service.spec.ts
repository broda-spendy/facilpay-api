import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AppLogger } from '../logger/logger.service';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as otplib from 'otplib';
import { PasswordStrengthService } from './password-strength.service';

jest.mock('bcrypt');

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
  generateURI: jest.fn(() => 'otpauth://totp/FacilPay:test%40example.com'),
  verifySync: jest.fn(() => ({ valid: true })),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    findByIdWithSecrets: jest.fn(),
    setTwoFactorSecret: jest.fn(),
    enableTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
  };

  const mockAppLogger = {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    })),
  };

  const mockMailService = {
    sendVerificationEmail: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'TWO_FACTOR_ENCRYPTION_KEY') {
        return 'test-two-factor-encryption-key';
      }
      return undefined;
    }),
  };

  const mockManager = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    getRepository: jest.fn(() => ({ save: jest.fn().mockResolvedValue({}) })),
  };

  const mockDataSource = {
    transaction: jest.fn(<T>(cb: (manager: typeof mockManager) => Promise<T>) =>
      cb(mockManager),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AppLogger,
          useValue: mockAppLogger,
        },
        {
          provide: require('./mail/mail.service').MailService,
          useValue: mockMailService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: 'RefreshTokenRepository',
          useValue: { save: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: 'PasswordResetTokenRepository',
          useValue: { save: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: PasswordStrengthService,
          useValue: {
            validateAndScore: jest
              .fn()
              .mockResolvedValue({ score: 3, feedback: [] }),
          },
        },
        {
          provide: 'RoleRepository',
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const createdUser = {
        id: '123',
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(createdUser);

      const result = await service.register(registerDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersService.create).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual({
        message:
          'User registered successfully. Please check your email to verify your account.',
        user: createdUser,
      });
    });

    it('should throw UnauthorizedException if user already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'password123',
      };

      const existingUser = {
        id: '123',
        email: 'existing@example.com',
        password: 'hashedpassword',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsersService.findByEmail.mockResolvedValue(existingUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'User already exists',
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login user and return access token', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user = {
        id: '123',
        email: 'test@example.com',
        password: 'hashedpassword',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEmailVerified: true,
      };

      mockUsersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('jwt-token-123');
      mockJwtService.signAsync.mockResolvedValue('jwt-token-123');

      const result = await service.login(loginDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        user.password,
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
      expect(result).toMatchObject({
        access_token: 'jwt-token-123',
        refresh_token: expect.any(String),
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          isEmailVerified: true,
        },
      });
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const user = {
        id: '123',
        email: 'test@example.com',
        password: 'hashedpassword',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsersService.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('should return user without password if found', async () => {
      const userId = '123';
      const user = {
        id: userId,
        email: 'test@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUsersService.findOne.mockResolvedValue(user);

      const result = await service.validateUser(userId);

      expect(usersService.findOne).toHaveBeenCalledWith(userId);
      expect(result).toEqual(user);
    });

    it('should return null if user not found', async () => {
      const userId = 'nonexistent';

      mockUsersService.findOne.mockRejectedValue(new Error('Not found'));

      const result = await service.validateUser(userId);

      expect(usersService.findOne).toHaveBeenCalledWith(userId);
      expect(result).toBeNull();
    });
  });

  describe('regenerateBackupCodes', () => {
    const user = {
      id: 'user-id-123',
      email: 'test@example.com',
      password: 'hashed-password',
      twoFactorEnabled: true,
      twoFactorSecret: 'encrypted-secret',
      backupCodes: ['old-hash-1'],
    };

    const encryptTwoFactorSecret = (secret: string) =>
      (
        service as unknown as {
          encryptTwoFactorSecret: (secret: string) => string;
        }
      ).encryptTwoFactorSecret(secret);

    beforeEach(() => {
      mockManager.findOne.mockReset();
      mockManager.save.mockReset();
      mockManager.findOne.mockResolvedValue(user);
      mockManager.save.mockResolvedValue(user);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    });

    it('should regenerate backup codes when given a valid password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.regenerateBackupCodes('user-id-123', {
        password: 'P@ssw0rd!',
      });

      expect(result.backupCodes).toHaveLength(10);
      const hashedCodes = Array.from({ length: 10 }, () => 'new-hash');
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ backupCodes: hashedCodes }),
      );
    });

    it('should regenerate backup codes when given a valid TOTP code', async () => {
      mockManager.findOne.mockResolvedValue({
        ...user,
        twoFactorSecret: encryptTwoFactorSecret('JBSWY3DPEHPK3PXP'),
      });
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: true });

      const result = await service.regenerateBackupCodes('user-id-123', {
        twoFactorCode: '123456',
      });

      expect(otplib.verifySync).toHaveBeenCalled();
      expect(result.backupCodes).toHaveLength(10);
    });

    it('should throw UnauthorizedException for an invalid password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.regenerateBackupCodes('user-id-123', { password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for an invalid TOTP code', async () => {
      mockManager.findOne.mockResolvedValue({
        ...user,
        twoFactorSecret: encryptTwoFactorSecret('JBSWY3DPEHPK3PXP'),
      });
      (otplib.verifySync as jest.Mock).mockReturnValue({ valid: false });

      await expect(
        service.regenerateBackupCodes('user-id-123', {
          twoFactorCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when neither password nor TOTP code is provided', async () => {
      await expect(
        service.regenerateBackupCodes('user-id-123', {}),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when 2FA is not enabled', async () => {
      mockManager.findOne.mockResolvedValue({
        ...user,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      await expect(
        service.regenerateBackupCodes('user-id-123', { password: 'P@ssw0rd!' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const user = {
      id: 'user-id-123',
      email: 'test@example.com',
      roles: ['USER'],
    };

    const validTokenRecord = {
      id: 'token-row-id',
      userId: user.id,
      token: expect.any(String),
      revoked: false,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    beforeEach(() => {
      mockManager.findOne.mockReset();
      mockManager.update.mockReset();
      mockManager.getRepository.mockReset();
      mockManager.getRepository.mockReturnValue({
        save: jest.fn().mockResolvedValue({}),
      });
      mockJwtService.signAsync.mockResolvedValue('new-access-token');
      mockUsersService.findOne.mockResolvedValue(user);
    });

    it('should rotate tokens on a valid refresh call', async () => {
      mockManager.findOne.mockResolvedValue(validTokenRecord);
      mockManager.update.mockResolvedValue(undefined);

      const result = await service.refresh('raw-valid-token');

      expect(result).toEqual({
        access_token: 'new-access-token',
        refresh_token: expect.any(String),
      });

      expect(mockManager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: validTokenRecord.id },
        { revoked: true },
      );
    });

    it('should return 401 for an expired refresh token', async () => {
      mockManager.findOne.mockResolvedValue({
        ...validTokenRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('raw-expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return 401 for a non-existent refresh token', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(service.refresh('raw-unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke all user sessions and return 401 on reuse of invalidated token', async () => {
      const revokedTokenRecord = {
        ...validTokenRecord,
        revoked: true,
      };
      mockManager.findOne.mockResolvedValue(revokedTokenRecord);
      mockManager.update.mockResolvedValue(undefined);

      await expect(service.refresh('raw-reused-token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockManager.update).toHaveBeenCalledWith(
        expect.anything(),
        { userId: user.id },
        { revoked: true },
      );
    });

    it('should return 401 when the user no longer exists', async () => {
      mockManager.findOne.mockResolvedValue(validTokenRecord);
      mockUsersService.findOne.mockRejectedValue(new Error('Not found'));

      await expect(service.refresh('raw-valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
