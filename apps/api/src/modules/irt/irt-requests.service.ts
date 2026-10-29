import { HttpException, Injectable } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import {
  analysisRequestDetail,
  adoptTryoutArtifact,
  IrtOrchestrationError,
  listAnalysisRequests,
  prepareTryoutAnalysis,
  retryTryoutAnalysis,
} from '@tka/irt-orchestration';
import type { PrepareIrtRequestDto } from './irt-requests.dto';
import type { ContentPageDto } from '../content/content.dto';

@Injectable()
export class IrtRequestsService {
  private async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof IrtOrchestrationError)
        throw new HttpException({ code: error.code, detail: error.code }, error.status);
      if (['23514', '23505'].includes((error as { code?: string }).code ?? ''))
        throw new HttpException(
          {
            code: 'IRT_REQUEST_CONFLICT',
            detail: 'Request tidak sesuai state atau dependency yang disetujui.',
          },
          409,
        );
      throw error;
    }
  }
  prepare(actor: string, key: string, input: PrepareIrtRequestDto) {
    return this.execute(() => prepareTryoutAnalysis(getDatabase().client, actor, key, input));
  }
  retry(actor: string, key: string, id: string) {
    return this.execute(() => retryTryoutAnalysis(getDatabase().client, actor, key, id));
  }
  adopt(actor: string, id: string) {
    return this.execute(async () => {
      await adoptTryoutArtifact(getDatabase().client, id, actor);
      return analysisRequestDetail(getDatabase().client, id);
    });
  }
  detail(id: string) {
    return this.execute(() => analysisRequestDetail(getDatabase().client, id));
  }
  list(page: ContentPageDto) {
    return this.execute(() => listAnalysisRequests(getDatabase().client, page.limit, page.offset));
  }
}
