import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '../modules/extraction/extraction-error';
import { ExtractionController } from '../modules/extraction/extraction.controller';
import type { ExtractionService } from '../modules/extraction/extraction.service';
import { AppException } from '../shared/exceptions';

const RUN_RESPONSE = {
  runId: 'run-1',
  extraction: {
    property: { name: 'Test', managementType: 'WEG' as const },
    buildings: [{ label: 'A', street: 'X', houseNumber: '1' }],
    units: [],
    contacts: [],
    confidenceByField: {},
    sourceSpansByField: {},
    warnings: [],
  },
  warnings: [],
  confidence: 0.9,
  durationMs: 4500,
  cached: false,
};

function makeController(run: ReturnType<typeof vi.fn>) {
  const service = { run } as unknown as ExtractionService;
  return new ExtractionController(service);
}

describe('ExtractionController.run', () => {
  it('forwards to ExtractionService and returns the wire shape', async () => {
    const run = vi.fn(async () => RUN_RESPONSE);
    const controller = makeController(run);
    const result = await controller.run({ documentId: 'doc-1' }, undefined);
    expect(result.runId).toBe('run-1');
    expect(run).toHaveBeenCalledWith('doc-1', { force: false });
  });

  it('passes force=true when the query param is present', async () => {
    const run = vi.fn(async () => RUN_RESPONSE);
    const controller = makeController(run);
    await controller.run({ documentId: 'doc-1' }, 'true');
    expect(run).toHaveBeenCalledWith('doc-1', { force: true });
  });

  it('treats any non-"true" force value as false', async () => {
    const run = vi.fn(async () => RUN_RESPONSE);
    const controller = makeController(run);
    await controller.run({ documentId: 'doc-1' }, '1');
    expect(run).toHaveBeenCalledWith('doc-1', { force: false });
  });

  it('maps ExtractionError(document_missing) → 404 NOT_FOUND', async () => {
    const run = vi.fn(async () => {
      throw new ExtractionError('document_missing', 'gone');
    });
    const controller = makeController(run);
    await expect(controller.run({ documentId: 'x' }, undefined)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });

  it('maps ExtractionError(too_large) → 413 EXTRACTION_TOO_LARGE', async () => {
    const run = vi.fn(async () => {
      throw new ExtractionError('too_large', 'over budget');
    });
    const controller = makeController(run);
    try {
      await controller.run({ documentId: 'x' }, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect((error as AppException).code).toBe('EXTRACTION_TOO_LARGE');
    }
  });

  it('maps ExtractionError(timeout) → 504 EXTRACTION_TIMEOUT', async () => {
    const run = vi.fn(async () => {
      throw new ExtractionError('timeout', 'slow');
    });
    const controller = makeController(run);
    try {
      await controller.run({ documentId: 'x' }, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppException).getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect((error as AppException).code).toBe('EXTRACTION_TIMEOUT');
    }
  });

  it('maps ExtractionError(parse_failed) → 502 EXTRACTION_PARSE_FAILED', async () => {
    const run = vi.fn(async () => {
      throw new ExtractionError('parse_failed', 'bad json');
    });
    const controller = makeController(run);
    try {
      await controller.run({ documentId: 'x' }, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect((error as AppException).code).toBe('EXTRACTION_PARSE_FAILED');
    }
  });

  it('rethrows non-ExtractionError unchanged', async () => {
    const sentinel = new Error('something else');
    const run = vi.fn(async () => {
      throw sentinel;
    });
    const controller = makeController(run);
    await expect(controller.run({ documentId: 'x' }, undefined)).rejects.toBe(sentinel);
  });
});
