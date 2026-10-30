import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterProfileDto } from './identity.dto';

describe('self-registration role boundary', () => {
  it.each(['STUDENT', 'TEACHER'])('accepts %s', async (role) => {
    expect(await validate(plainToInstance(RegisterProfileDto, { role }))).toEqual([]);
  });

  it.each([undefined, null, '', 'ADMIN', 'student', 1, {}])(
    'rejects a missing or non-registerable role: %j',
    async (role) => {
      const errors = await validate(plainToInstance(RegisterProfileDto, { role }), {
        skipMissingProperties: true,
      });
      expect(errors).toEqual([expect.objectContaining({ property: 'role' })]);
    },
  );
});
