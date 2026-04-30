import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';
import { ValidationException } from './exceptions';

@Injectable()
export class ZodValidationPipe<T = unknown> implements PipeTransform<unknown, T> {
  constructor(private readonly schema?: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    if (!this.schema) return value as T;
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationException(error.issues);
      }
      throw error;
    }
  }
}
