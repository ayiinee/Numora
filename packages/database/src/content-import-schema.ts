// Generated from packages/contracts/questions/question-import-v2.schema.json.
export const contentImportSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:numora:question-import:v2',
  title: 'Question import v2 ? internal DRAFT preview',
  type: 'object',
  additionalProperties: false,
  required: [
    'externalId',
    'type',
    'chapterCode',
    'subchapterCode',
    'competencyCode',
    'stem',
    'answer',
    'explanation',
    'metadata',
    'options',
  ],
  properties: {
    externalId: {
      type: 'string',
      minLength: 1,
      pattern: '^[A-Za-z0-9_-]{1,128}$',
      maxLength: 128,
    },
    type: {
      type: 'string',
      enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE_MULTIPLE_ANSWER', 'CATEGORY'],
    },
    chapterCode: {
      type: 'string',
      minLength: 1,
      pattern: '^[A-Za-z0-9_-]{1,128}$',
      maxLength: 128,
    },
    subchapterCode: {
      type: 'string',
      minLength: 1,
      pattern: '^[A-Za-z0-9_-]{1,128}$',
      maxLength: 128,
    },
    competencyCode: {
      type: 'string',
      minLength: 1,
      pattern: '^[A-Za-z0-9_-]{1,128}$',
      maxLength: 128,
    },
    levelCode: {
      type: ['string', 'null'],
    },
    difficulty: {
      type: ['string', 'null'],
      enum: ['EASY', 'MEDIUM', 'HARD', null],
    },
    stem: {
      $ref: '#/$defs/richText',
    },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'content'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            pattern: '^[A-Za-z0-9_-]{1,128}$',
          },
          content: {
            $ref: '#/$defs/richText',
          },
        },
      },
      minItems: 2,
      maxItems: 100,
    },
    answer: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['optionId'],
          properties: {
            optionId: {
              type: 'string',
            },
          },
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
              items: {
                type: 'string',
              },
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
              additionalProperties: {
                type: 'string',
              },
            },
          },
        },
      ],
    },
    explanation: {
      $ref: '#/$defs/richText',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      properties: {
        source: {
          type: ['string', 'null'],
        },
        generationModel: {
          type: ['string', 'null'],
        },
        generationBatchId: {
          type: ['string', 'null'],
        },
        sourceLevelNumber: {
          type: 'integer',
          minimum: 1,
        },
        categories: {
          type: 'array',
          minItems: 2,
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'label'],
            properties: {
              id: {
                type: 'string',
                pattern: '^[A-Za-z0-9_-]{1,128}$',
              },
              label: {
                type: 'string',
                minLength: 1,
                maxLength: 1000,
              },
            },
          },
        },
        assetManifest: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: true,
            required: [
              'externalId',
              'assetId',
              'textMarker',
              'placement',
              'itemId',
              'assetOrder',
              'altText',
              'objectKey',
              'sha256',
              'contentType',
              'byteLength',
              'bucket',
            ],
            properties: {
              externalId: {
                type: 'string',
              },
              assetId: {
                type: 'string',
                pattern: '^[A-Za-z0-9_-]{1,128}$',
              },
              textMarker: {
                type: 'string',
              },
              placement: {
                enum: ['STEM', 'OPTION', 'STATEMENT', 'EXPLANATION'],
              },
              itemId: {
                type: ['string', 'null'],
              },
              assetOrder: {
                type: 'integer',
                minimum: 1,
              },
              altText: {
                type: 'string',
                minLength: 1,
              },
              objectKey: {
                type: ['string', 'null'],
              },
              sha256: {
                type: 'string',
                pattern: '^[a-f0-9]{64}$',
              },
              contentType: {
                enum: ['image/png', 'image/jpeg', 'image/webp'],
              },
              byteLength: {
                type: 'integer',
                minimum: 1,
                maximum: 5242880,
              },
              bucket: {
                type: 'string',
              },
            },
          },
        },
      },
      required: ['sourceLevelNumber'],
    },
  },
  $defs: {
    richText: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          maxLength: 100000,
        },
        assetKeys: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: [],
        },
      },
    },
  },
  allOf: [
    {
      if: {
        properties: {
          type: {
            const: 'SINGLE_CHOICE',
          },
        },
      },
      then: {
        required: ['options'],
        properties: {
          answer: {
            type: 'object',
            required: ['optionId'],
            additionalProperties: false,
            properties: {
              optionId: {
                type: 'string',
                minLength: 1,
              },
            },
          },
          options: {
            type: 'array',
          },
        },
      },
    },
    {
      if: {
        properties: {
          type: {
            const: 'MULTIPLE_CHOICE_MULTIPLE_ANSWER',
          },
        },
      },
      then: {
        required: ['options'],
        properties: {
          answer: {
            type: 'object',
            required: ['optionIds'],
            additionalProperties: false,
            properties: {
              optionIds: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: {
                  type: 'string',
                  minLength: 1,
                },
              },
            },
          },
          options: {
            type: 'array',
          },
        },
      },
    },
    {
      if: {
        properties: {
          type: {
            const: 'CATEGORY',
          },
        },
      },
      then: {
        required: ['options'],
        properties: {
          answer: {
            type: 'object',
            required: ['categoryByStatementId'],
            additionalProperties: false,
            properties: {
              categoryByStatementId: {
                type: 'object',
                minProperties: 1,
                additionalProperties: {
                  type: 'string',
                  minLength: 1,
                },
              },
            },
          },
          metadata: {
            required: ['categories'],
            properties: {
              categories: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['id', 'label'],
                  properties: {
                    id: {
                      type: 'string',
                      minLength: 1,
                    },
                    label: {
                      type: 'string',
                      minLength: 1,
                    },
                  },
                },
              },
            },
            type: 'object',
          },
          options: {
            type: 'array',
          },
        },
      },
    },
  ],
} as const;
