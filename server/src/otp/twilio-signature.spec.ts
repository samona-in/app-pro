import { createHash, createHmac } from 'node:crypto';
import { validateTwilioJsonSignature } from './twilio-signature';

const AUTH_TOKEN = 'test-auth-token';
const BASE_URL = 'https://api.example.com/webhooks/twilio/verify';

/** Builds exactly what Twilio sends: body hash in the query, HMAC over that URL. */
function signedRequest(body: string, token = AUTH_TOKEN) {
  const bodySHA256 = createHash('sha256').update(body, 'utf8').digest('hex');
  const url = `${BASE_URL}?bodySHA256=${bodySHA256}`;
  const signature = createHmac('sha1', token).update(url, 'utf8').digest('base64');
  return { url, signature, bodySHA256 };
}

describe('validateTwilioJsonSignature', () => {
  const body = JSON.stringify([
    { id: 'evt-1', type: 'com.twilio.accountsecurity.verify.message.sent' },
  ]);

  it('accepts a correctly signed JSON callback', () => {
    const { url, signature } = signedRequest(body);
    expect(
      validateTwilioJsonSignature({ authToken: AUTH_TOKEN, signature, url, rawBody: body }),
    ).toBe(true);
  });

  it('rejects a body that does not match its bodySHA256', () => {
    const { url, signature } = signedRequest(body);
    expect(
      validateTwilioJsonSignature({
        authToken: AUTH_TOKEN,
        signature,
        url,
        rawBody: `${body} `,
      }),
    ).toBe(false);
  });

  it('rejects a signature made with a different auth token', () => {
    const { url, signature } = signedRequest(body, 'another-token');
    expect(
      validateTwilioJsonSignature({ authToken: AUTH_TOKEN, signature, url, rawBody: body }),
    ).toBe(false);
  });

  it('rejects a URL without bodySHA256 instead of falling back to form validation', () => {
    const signature = createHmac('sha1', AUTH_TOKEN).update(BASE_URL).digest('base64');
    expect(
      validateTwilioJsonSignature({
        authToken: AUTH_TOKEN,
        signature,
        url: BASE_URL,
        rawBody: body,
      }),
    ).toBe(false);
  });

  it('rejects an empty signature', () => {
    const { url } = signedRequest(body);
    expect(
      validateTwilioJsonSignature({ authToken: AUTH_TOKEN, signature: '', url, rawBody: body }),
    ).toBe(false);
  });
});
