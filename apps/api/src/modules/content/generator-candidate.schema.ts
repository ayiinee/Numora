export const generatorCandidateSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:numora:generator-service-v1:candidate',
  type: 'object',
  additionalProperties: false,
  required: [
    'questionType',
    'stem',
    'optionsOrStatements',
    'answerKey',
    'explanation',
    'media',
    'difficulty',
    'rubricVersionId',
    'contentFingerprint',
  ],
  properties: {
    questionType: { enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'] },
    stem: { $ref: '#/$defs/text' },
    explanation: { $ref: '#/$defs/text' },
    optionsOrStatements: {
      type: 'object',
      additionalProperties: false,
      required: ['options', 'categories'],
      properties: {
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'content'],
            properties: { id: { $ref: '#/$defs/id' }, content: { $ref: '#/$defs/text' } },
          },
        },
        categories: {
          type: 'array',
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'label'],
            properties: {
              id: { $ref: '#/$defs/id' },
              label: { type: 'string', minLength: 1, maxLength: 1000 },
            },
          },
        },
      },
    },
    answerKey: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['optionId'],
          properties: { optionId: { $ref: '#/$defs/id' } },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['optionIds'],
          properties: {
            optionIds: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { $ref: '#/$defs/id' },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['categoryByStatementId'],
          properties: {
            categoryByStatementId: {
              type: 'object',
              minProperties: 2,
              additionalProperties: { $ref: '#/$defs/id' },
            },
          },
        },
      ],
    },
    media: { type: 'array', maxItems: 0 },
    difficulty: { enum: [null, 'EASY', 'MEDIUM', 'HARD'] },
    rubricVersionId: {
      type: 'string',
      format: 'uuid',
      not: { const: '00000000-0000-0000-0000-000000000000' },
    },
    contentFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
  $defs: {
    id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' },
    text: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string', minLength: 1, maxLength: 100000 } },
    },
  },
};
