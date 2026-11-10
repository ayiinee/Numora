import { HttpException, Injectable } from '@nestjs/common';
import { getDatabase } from '@tka/database';
import {
  analysisRequestDetail,
  adoptTryoutArtifact,
  adoptTryoutArtifactV1,
  finalizeTryoutArtifactV1,
  prepareTryoutReleaseV1,
  publishTryoutReleaseV1,
  saveTryoutDeliveryBindingV1,
  tryoutDeliveryReadinessV1,
  getIrtResearchDatabaseV1,
  closeIrtResearchDatabaseV1,
  IrtOrchestrationError,
  listAnalysisRequests,
  prepareTryoutAnalysis,
  retryTryoutAnalysis,
} from '@tka/irt-orchestration';
import type {
  IrtDeliveryBindingV1Dto,
  PrepareIrtReleaseV1Dto,
  PrepareIrtRequestDto,
} from './irt-requests.dto';
import type { ContentPageDto } from '../content/content.dto';

@Injectable()
export class IrtRequestsService {
  async onModuleDestroy() {
    await closeIrtResearchDatabaseV1();
  }
  private async execute<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof IrtOrchestrationError)
        throw new HttpException({ code: error.code, detail: error.code }, error.status);
      if (['23514', '23505', '22P02', '22023'].includes((error as { code?: string }).code ?? ''))
        throw new HttpException(
          {
            code: 'IRT_REQUEST_CONFLICT',
            detail: 'Request tidak sesuai state atau dependency yang disetujui.',
          },
          409,
        );
      if (error instanceof Error && /^IRT_(RELEASE|V1|BINDING|DELIVERY)_/.test(error.message))
        throw new HttpException(
          { code: error.message, detail: error.message },
          error.message.endsWith('DISABLED') ? 404 : 409,
        );
      throw error;
    }
  }
  prepare(actor: string, key: string, input: PrepareIrtRequestDto) {
    return this.execute(() => prepareTryoutAnalysis(getDatabase().client, actor, key, input));
  }
  bindDeliveryV1(actor: string, batchId: string, input: IrtDeliveryBindingV1Dto) {
    return this.execute(() =>
      saveTryoutDeliveryBindingV1(getIrtResearchDatabaseV1(), batchId, actor, input),
    );
  }
  deliveryReadinessV1(batchId: string) {
    return this.execute(() => tryoutDeliveryReadinessV1(getIrtResearchDatabaseV1(), batchId));
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
  adoptResearchV1(id: string) {
    return this.execute(() => adoptTryoutArtifactV1(getIrtResearchDatabaseV1(), id));
  }
  finalizeResearchV1(receiptId: string) {
    return this.execute(() => finalizeTryoutArtifactV1(getIrtResearchDatabaseV1(), receiptId));
  }
  prepareReleaseV1(batchId: string, input: PrepareIrtReleaseV1Dto) {
    return this.execute(() =>
      prepareTryoutReleaseV1(
        getIrtResearchDatabaseV1(),
        batchId,
        input.requestId,
        input.approvalId,
      ),
    );
  }
  publishReleaseV1(id: string) {
    return this.execute(() => publishTryoutReleaseV1(getIrtResearchDatabaseV1(), id));
  }
  detail(id: string) {
    return this.execute(() => analysisRequestDetail(getDatabase().client, id));
  }
  list(page: ContentPageDto) {
    return this.execute(() => listAnalysisRequests(getDatabase().client, page.limit, page.offset));
  }
}
