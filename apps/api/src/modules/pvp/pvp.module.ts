import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PvpController } from './pvp.controller';
import { PvpEngineService } from './pvp-engine.service';
import { PvpGateway } from './pvp.gateway';
import { PvpSchedulerService } from './pvp-scheduler.service';
import { PvpService } from './pvp.service';
import { PVP_POLICY } from './pvp.policy';

@Module({
  imports: [IdentityModule],
  exports: [PvpService],
  controllers: [PvpController],
  providers: [
    PvpService,
    PvpEngineService,
    PvpGateway,
    PvpSchedulerService,
    { provide: PVP_POLICY, useValue: null },
  ],
})
export class PvpModule {}
