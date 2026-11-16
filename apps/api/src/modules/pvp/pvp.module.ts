import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PvpController } from './pvp.controller';
import { PvpEngineService } from './pvp-engine.service';
import { PvpGateway } from './pvp.gateway';
import { PvpSchedulerService } from './pvp-scheduler.service';
import { PvpService } from './pvp.service';
import { PVP_POLICY } from './pvp.policy';
import { resolvePvpPolicy } from './pvp-runtime.policy';
import { apiRole } from '../../runtime/api-role';

@Module({
  imports: [IdentityModule],
  exports: [PvpService],
  controllers: apiRole() === 'http' ? [] : [PvpController],
  providers: [
    PvpService,
    PvpEngineService,
    ...(apiRole() === 'http' ? [] : [PvpGateway, PvpSchedulerService]),
    { provide: PVP_POLICY, useFactory: resolvePvpPolicy },
  ],
})
export class PvpModule {}
