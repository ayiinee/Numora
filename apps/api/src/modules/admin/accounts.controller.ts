import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard, type AdminRequest } from '../identity/admin.guard';
import { RequireAdminCapability } from '../identity/admin-capabilities';
import {
  AdminAccountDto,
  AdminAccountQueryDto,
  AdminAccountsDto,
  AdminInvitationDto,
  AdminRecoveryDto,
  AdminInvitationsDto,
  InviteAdminDto,
  UpdateAdminAccountDto,
} from './accounts.dto';
import { AdminAccountsService } from './accounts.service';

@ApiTags('admin-accounts')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@RequireAdminCapability('ADMIN_ACCOUNTS_MANAGE')
@Controller('admin')
export class AdminAccountsController {
  constructor(@Inject(AdminAccountsService) private readonly accounts: AdminAccountsService) {}
  @Post('accounts/:id/recovery')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminRecoveryDto })
  recover(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.accounts.recover(req.adminId, id, key);
  }
  @Get('accounts') @ApiOkResponse({ type: AdminAccountsDto }) list(
    @Query() query: AdminAccountQueryDto,
  ) {
    return this.accounts.accounts(query);
  }
  @Get('accounts/:id') @ApiOkResponse({ type: AdminAccountDto }) detail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.account(id);
  }
  @Patch('accounts/:id') @ApiOkResponse({ type: AdminAccountDto }) update(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateAdminAccountDto,
  ) {
    return this.accounts.update(req.adminId, id, input);
  }
  @Get('invitations') @ApiOkResponse({ type: AdminInvitationsDto }) invitations(
    @Query() query: AdminAccountQueryDto,
  ) {
    return this.accounts.invitations(query);
  }
  @Post('invitations')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminInvitationDto })
  invite(
    @Req() req: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: InviteAdminDto,
  ) {
    return this.accounts.invite(req.adminId, key, input);
  }
  @Post('invitations/:id/retry') @ApiOkResponse({ type: AdminInvitationDto }) retry(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.retry(req.adminId, id);
  }
  @Post('invitations/:id/cancel') @ApiOkResponse({ type: AdminInvitationDto }) cancel(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.cancel(req.adminId, id);
  }
}
@ApiTags('admin-accounts')
@ApiBearerAuth()
@Controller('admin/invitation')
export class AdminInvitationAcceptanceController {
  constructor(@Inject(AdminAccountsService) private readonly accounts: AdminAccountsService) {}
  @Get('status') @ApiOkResponse({ type: AdminInvitationDto }) status(
    @Headers('authorization') authorization?: string,
  ) {
    return this.accounts.acceptanceStatus(authorization);
  }
  @Post('accept') @ApiOkResponse({ type: AdminAccountDto }) accept(
    @Headers('authorization') authorization?: string,
  ) {
    return this.accounts.accept(authorization);
  }
}
