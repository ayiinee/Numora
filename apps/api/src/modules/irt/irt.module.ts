import { IrtOperationsService } from './irt-operations.service';
import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IrtController } from './irt.controller';
import { IrtService } from './irt.service';
import { IrtIntegrationService } from './irt-integration.service';
import { IrtRequestsService } from './irt-requests.service';
@Module({
  imports: [IdentityModule],
  controllers: [IrtController],
  providers: [IrtService, IrtIntegrationService, IrtRequestsService, IrtOperationsService],
  exports: [IrtIntegrationService],
})
export class IrtModule {}
