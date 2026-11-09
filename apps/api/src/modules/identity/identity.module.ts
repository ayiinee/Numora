import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { AdminGuard } from './admin.guard';
import { ContentAdminGuard } from './content-admin.guard';
import { ConfigModule } from '@nestjs/config';
import { ProfileController, ProfileOwnerGuard } from './profile.controller';
import { ProfileService } from './profile.service';
import { R2MediaStorage } from '../content/r2-media.storage';

@Module({
  imports: [ConfigModule],
  controllers: [IdentityController, ProfileController],
  providers: [
    IdentityService,
    AdminGuard,
    ContentAdminGuard,
    ProfileService,
    ProfileOwnerGuard,
    R2MediaStorage,
  ],
  exports: [IdentityService, AdminGuard, ContentAdminGuard],
})
export class IdentityModule {}
