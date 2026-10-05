import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminOperationsController } from './operations.controller';
import { AdminOperationsService } from './operations.service';
import {
  AdminAccountsController,
  AdminInvitationAcceptanceController,
} from './accounts.controller';
import { AdminAccountsService } from './accounts.service';
import { AdminAuthProvider } from './admin-auth.provider';
@Module({
  imports: [IdentityModule],
  controllers: [
    AdminController,
    AdminOperationsController,
    AdminAccountsController,
    AdminInvitationAcceptanceController,
  ],
  providers: [AdminService, AdminOperationsService, AdminAccountsService, AdminAuthProvider],
})
export class AdminModule {}
