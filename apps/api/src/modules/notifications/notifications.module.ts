import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PvpModule } from '../pvp/pvp.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
@Module({
  imports: [IdentityModule, PvpModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
