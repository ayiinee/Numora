import { ServiceUnavailableException } from '@nestjs/common';
import { decodeSingleChoice as decode, AssessmentFinalizationError } from '@tka/assessment-engine';
export type { SingleChoiceVersion } from '@tka/assessment-engine';

export function decodeSingleChoice(row: Parameters<typeof decode>[0]) {
  try { return decode(row); }
  catch (error) {
    if (error instanceof AssessmentFinalizationError)
      throw new ServiceUnavailableException({ code: error.code, detail: error.message });
    throw error;
  }
}
