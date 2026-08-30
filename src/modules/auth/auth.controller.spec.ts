// otplib uses ESM dependencies that Jest cannot transform — mock it entirely
jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: jest.fn().mockReturnValue('MOCKSECRET'),
    keyuri: jest.fn().mockReturnValue('otpauth://totp/mock'),
    verify: jest.fn().mockReturnValue(false),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import {
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { RegisterDto } from '../users/dto/register.dto';
import { LoginDto } from '../users/dto/login.dto';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    enableTwoFactor: jest.fn(),
    verifyTwoFactor: jest.fn(),
    disableTwoFactor: jest.fn(),
    createRole: jest.fn(),
    assignRole: jest.fn(),
  };

  const mockUsersService = {
    unlockAccount: jest.fn(),
  };

  const mockRoleRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRoleRepository,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        message: 'User registered successfully',
        user: {
          id: '1',
          email: 'test@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('login', () => {
    it('should login a user and return access token', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const expectedResult = {
        access_token: 'jwt-token',
        user: {
          id: '1',
          email: 'test@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const response = { status: jest.fn() } as any;
      const result = await controller.login(loginDto, response);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(response.status).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should return 202 when two-factor code is required', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const response = { status: jest.fn() } as any;
      const expectedResult = {
        '2fa_required': true,
        message: 'Two-factor authentication code required',
      };

      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto, response);

      expect(response.status).toHaveBeenCalledWith(202);
      expect(result).toEqual(expectedResult);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // disableTwoFactor — throttle & delegation tests  (Issue #322)
  // ──────────────────────────────────────────────────────────────────────────
  describe('disableTwoFactor', () => {
    it('should call authService.disableTwoFactor with the current user and dto', async () => {
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { password: 'CorrectP@ss1' };
      const expectedResult = {
        message: 'Two-factor authentication disabled',
        twoFactorEnabled: false,
      };

      mockAuthService.disableTwoFactor.mockResolvedValue(expectedResult);

      const result = await controller.disableTwoFactor(mockUser, dto);

      expect(authService.disableTwoFactor).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should have @AuthThrottle metadata — confirming rate limiting is applied to this endpoint', () => {
      // @AuthThrottle() applies Throttle({ auth: 5 }) which stores THROTTLER:TTLauth and
      // THROTTLER:LIMITauth metadata keys on the method descriptor.
      // Presence of these keys proves the decorator was applied correctly.
      const metaKeys: string[] = Reflect.getMetadataKeys(
        AuthController.prototype.disableTwoFactor,
      );

      expect(metaKeys).toContain('THROTTLER:TTLauth');
      expect(metaKeys).toContain('THROTTLER:LIMITauth');
    });

    it('should propagate UnauthorizedException (wrong password) thrown by authService', async () => {
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { password: 'wrong' };

      mockAuthService.disableTwoFactor.mockRejectedValue(
        new UnauthorizedException('Invalid password'),
      );

      await expect(
        controller.disableTwoFactor(mockUser, dto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate 423 Locked error thrown by authService when account is locked', async () => {
      const { HttpException } = require('@nestjs/common');
      const mockUser = { id: 'user-uuid', email: 'user@example.com' } as any;
      const dto = { password: 'any' };

      const lockedError = new HttpException(
        { statusCode: 423, message: 'Account is locked. Please try again in 900 seconds.', error: 'Locked' },
        HttpStatus.LOCKED ?? 423,
      );
      mockAuthService.disableTwoFactor.mockRejectedValue(lockedError);

      await expect(
        controller.disableTwoFactor(mockUser, dto),
      ).rejects.toThrow(HttpException);
    });
  });
});
