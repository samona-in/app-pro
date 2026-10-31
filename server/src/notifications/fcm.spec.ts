import { generateKeyPairSync } from 'node:crypto';
import { createFcmClient } from './fcm';
import { logger } from '../common/logger';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('FCM delivery errors', () => {
  const token = 'a-private-native-fcm-registration-token';
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'oauth', expires_in: 3600 })),
      );
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function client() {
    return createFcmClient({
      projectId: 'test-project',
      clientEmail: 'test@example.com',
      privateKey,
    });
  }

  it('identifies a structured UNREGISTERED rejection as a permanently invalid token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            status: 'NOT_FOUND',
            message: `Rejected ${token}`,
            details: [
              {
                '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                errorCode: 'UNREGISTERED',
              },
            ],
          },
        }),
        { status: 404 },
      ),
    );

    expect(await client().send(token, { data: {} })).toMatchObject({
      ok: false,
      errorCode: 'UNREGISTERED',
      invalidToken: true,
    });
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(token);
  });

  it.each([
    [404, { status: 'NOT_FOUND' }],
    [
      400,
      {
        status: 'INVALID_ARGUMENT',
        details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest' }],
      },
    ],
    [403, { status: 'PERMISSION_DENIED' }],
    [503, { status: 'UNAVAILABLE' }],
  ])('keeps tokens for HTTP %s without a token-specific permanent error', async (status, error) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error }), { status }));
    const result = await client().send(token, { data: {} });
    expect(result.ok).toBe(false);
    expect(result).not.toMatchObject({ invalidToken: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never sends an Expo push token to direct FCM delivery', async () => {
    await expect(client().send('ExpoPushToken[abc]', { data: {} })).resolves.toMatchObject({
      ok: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs successful delivery without the full registration token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'projects/test/messages/1' })),
    );
    expect((await client().send(token, { data: {} })).ok).toBe(true);
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(token);
  });
});
