import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResult } from '../../common/interfaces';
import { Query } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from './user.entity';
import { UserRole } from '../../common/constants/roles';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('users')
@Controller('v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a user',
    description:
      'Creates a new user and returns the user (password is never returned). This endpoint is public.',
  })
  @ApiBody({
    type: CreateUserDto,
    examples: {
      basic: {
        summary: 'Create user with email + password',
        value: { email: 'jane.doe@example.com', password: 'P@ssw0rd!' },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T10:00:00.000Z',
      },
    },
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      "Updates the authenticated user's profile. Supports updating display name, email, and password. If email is changed, email verification is required. Changing password requires the current password and invalidates all refresh tokens.",
  })
  @ApiBody({
    type: UpdateUserDto,
    examples: {
      updateName: {
        summary: 'Update display name only',
        value: { name: 'Jane Doe' },
      },
      updateEmail: {
        summary: 'Update email only',
        value: { email: 'jane.new@example.com' },
      },
      updateBoth: {
        summary: 'Update both name and email',
        value: { name: 'Jane Doe', email: 'jane.new@example.com' },
      },
      updatePassword: {
        summary: 'Update password (requires current password)',
        value: { password: 'N3wP@ssw0rd!', currentPassword: 'Curr3nt@Pss!' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Profile updated successfully.',
    schema: {
      example: {
        user: {
          id: 'abc123',
          name: 'Jane Doe',
          email: 'jane.new@example.com',
          isEmailVerified: false,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T12:00:00.000Z',
        },
        emailVerificationRequired: true,
      },
    },
  })
  @ApiConflictResponse({
    description: 'Email is already taken by another account.',
    schema: {
      example: {
        statusCode: 409,
        message: 'Email is already taken by another account',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  async updateMe(
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      "Returns the authenticated user's profile. Password and 2FA secret are never included.",
  })
  @ApiOkResponse({
    description: 'Authenticated user profile.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        name: 'Jane Doe',
        roles: ['USER'],
        isEmailVerified: true,
        isActive: true,
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T10:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid access token.',
    schema: { example: { statusCode: 401, message: 'Unauthorized' } },
  })
  getMe(@CurrentUser() user: User) {
    return this.usersService.findOne(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'List users with pagination and filtering',
    description:
      'Returns paginated users (passwords are never returned). Admin only.',
  })
  @ApiOkResponse({
    description: 'Paginated list of users.',
    schema: {
      example: {
        data: [
          {
            id: 'abc123',
            email: 'jane.doe@example.com',
            roles: ['USER'],
            createdAt: '2026-01-26T10:00:00.000Z',
            updatedAt: '2026-01-26T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid access token.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  findAll(@Query() query: PaginationDto): Promise<PaginatedResult<any>> {
    return this.usersService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get a user by id',
    description:
      'Returns a single user by their id. Users can only view their own profile unless they are an admin.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiOkResponse({
    description: 'User found.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T10:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Non-admin users can only view their own profile.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.findOneWithAuth(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Updates user fields by id. Only provided fields will be changed. Supports updating display name, email, and password. Changing password requires the current password and invalidates all refresh tokens. Users can only update their own profile unless they are an admin.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiBody({
    type: UpdateUserDto,
    examples: {
      updateEmail: {
        summary: 'Update email only',
        value: { email: 'jane.new@example.com' },
      },
      updatePassword: {
        summary: 'Update password (requires current password)',
        value: { password: 'N3wP@ssw0rd!', currentPassword: 'Curr3nt@Pss!' },
      },
    },
  })
  @ApiOkResponse({
    description: 'User updated successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.new@example.com',
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'Non-admin users can only update their own profile.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Current password is incorrect when changing password.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Current password is incorrect',
      },
    },
  })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.usersService.updateWithAuth(id, updateUserDto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Delete a user',
    description: 'Soft deletes a user by id (sets deletedAt). Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiNoContentResponse({
    description: 'User deleted successfully.',
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
        error: 'Forbidden',
      },
    },
  })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.usersService.softDelete(
      id,
      user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Delete current user account',
    description: 'Soft deletes the authenticated user account.',
  })
  @ApiNoContentResponse({
    description: 'Account deleted successfully.',
  })
  async deleteSelf(@Req() req: Request) {
    await this.usersService.softDelete(
      req.user.id,
      req.user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/restore')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Restore a deleted user',
    description: 'Restores a soft-deleted user account. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiOkResponse({
    description: 'User restored successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        roles: ['USER'],
        isEmailVerified: true,
        isActive: true,
        deletedAt: null,
        createdAt: '2026-01-26T10:00:00.000Z',
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
        error: 'Forbidden',
      },
    },
  })
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.usersService.restore(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/rate-limit')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update user rate limit configuration',
    description:
      'Updates the rate limit configuration for a specific user. Admin only.',
  })
  @ApiParam({
    name: 'id',
    description: 'User id.',
    example: 'abc123',
  })
  @ApiBody({
    type: UpdateRateLimitDto,
    examples: {
      enableCustom: {
        summary: 'Enable custom rate limits',
        value: {
          rateLimitEnabled: true,
          rateLimitLimit: 200,
          rateLimitTtl: 60000,
        },
      },
      disableCustom: {
        summary: 'Disable custom rate limits',
        value: {
          rateLimitEnabled: false,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Rate limit configuration updated successfully.',
    schema: {
      example: {
        id: 'abc123',
        email: 'jane.doe@example.com',
        rateLimitEnabled: true,
        rateLimitLimit: 200,
        rateLimitTtl: 60000,
        updatedAt: '2026-01-26T12:00:00.000Z',
      },
    },
  })
  @ApiForbiddenResponse({
    description: 'User does not have ADMIN role.',
    schema: {
      example: {
        statusCode: 403,
        message: 'Forbidden',
      },
    },
  })
  async updateRateLimit(
    @Param('id') id: string,
    @Body() updateRateLimitDto: UpdateRateLimitDto,
  ) {
    return this.usersService.updateRateLimit(
      id,
      updateRateLimitDto.rateLimitEnabled ?? false,
      updateRateLimitDto.rateLimitLimit ?? null,
      updateRateLimitDto.rateLimitTtl ?? null,
    );
  }
}
