// Shared wire shape with internal preview; Student authorization/lifecycle remain separate.
export const assessmentAnswerSchema = {
  nullable: true,
  oneOf: [
    {
      type: 'object' as const,
      required: ['optionId'],
      additionalProperties: false,
      properties: { optionId: { type: 'string' as const } },
    },
    {
      type: 'object' as const,
      required: ['optionIds'],
      additionalProperties: false,
      properties: { optionIds: { type: 'array' as const, items: { type: 'string' as const } } },
    },
    {
      type: 'object' as const,
      required: ['categoryByStatementId'],
      additionalProperties: false,
      properties: {
        categoryByStatementId: {
          type: 'object' as const,
          additionalProperties: { type: 'string' as const },
        },
      },
    },
  ],
};
