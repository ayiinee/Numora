import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { AdminGuard } from './admin.guard';
import { ContentAdminGuard } from './content-admin.guard';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, AdminGuard, ContentAdminGuard],
  exports: [IdentityService, AdminGuard, ContentAdminGuard],
})
export class IdentityModule {}
