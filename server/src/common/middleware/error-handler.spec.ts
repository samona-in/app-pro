import express from 'express';
import request from 'supertest';
import { ApiErrorCode } from '@samona/types';
import { badRequest } from '../errors';
import { errorHandler, notFoundHandler } from './error-handler';
import { requestId } from './request-id';
import { logger } from '../logger';

// The handler is expected to log these failures; silence it so the suite's
// output stays readable, and assert the logging still happens.
beforeEach(() => {
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Builds a throwaway app whose single route throws whatever is passed in. */
function appThatThrows(error: unknown) {
  return express()
    .use(requestId)
    .get('/boom', () => {
      throw error;
    })
    .get('/async-boom', async () => {
      await Promise.resolve();
      throw error;
    })
    .use(notFoundHandler)
    .use(errorHandler);
}

describe('errorHandler', () => {
  it('returns the API envelope for a known error', async () => {
    const response = await request(appThatThrows(badRequest('Bad input.'))).get('/boom');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: ApiErrorCode.BAD_REQUEST,
      message: 'Bad input.',
    });
  });

  it('masks unexpected errors and never leaks internals', async () => {
    const leaky = new Error('connection to 10.0.0.5:5432 refused; password=hunter2');
    const response = await request(appThatThrows(leaky)).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe(ApiErrorCode.INTERNAL);
    expect(response.body.error.message).toBe('Something went wrong. Please try again.');

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('5432');
    expect(serialised).not.toContain('stack');

    // Masked for the client, but never swallowed server-side.
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('catches errors thrown from async handlers', async () => {
    const response = await request(appThatThrows(badRequest('Async bad input.'))).get(
      '/async-boom',
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Async bad input.');
  });

  it('returns NOT_FOUND for an unmatched route, with a request id', async () => {
    const response = await request(appThatThrows(new Error('unused'))).get('/nope');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ApiErrorCode.NOT_FOUND);
    expect(response.body.error.requestId).toEqual(expect.any(String));
  });
});
