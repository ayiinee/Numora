import { Injectable } from '@nestjs/common';
import { releasedTryoutPackageIds } from '@tka/database';

@Injectable()
export class TryoutReleaseService {
  releasedPackageIds(packageIds: string[], now = new Date()) {
    return releasedTryoutPackageIds(packageIds, now);
  }
}
