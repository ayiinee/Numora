import { BadRequestException } from '@nestjs/common';
import type { SaveDrillAnswerDto } from './learning.dto';

/** Missing and ambiguous input are errors; an explicit null clears the answer. */
export function assessmentAnswerInput(input: SaveDrillAnswerDto): unknown {
  const legacy = input.optionId !== undefined,
    typed = input.answer !== undefined;
  if (legacy === typed)
    throw new BadRequestException({
      code: 'ANSWER_INVALID',
      detail: 'Gunakan tepat satu field answer atau optionId.',
    });
  return typed ? input.answer : input.optionId === null ? null : { optionId: input.optionId };
}
