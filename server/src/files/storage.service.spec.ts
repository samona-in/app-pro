import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  AVATAR_MAX_BYTES,
  createStorageService,
  JOB_IMAGE_MAX_BYTES,
  SELFIE_MAX_BYTES,
  type SignUploadUrl,
} from './storage.service';

const REGION = 'us-east-1';
const SELFIES = 'pro-selfies';
const JOB_IMAGES = 'job-images';
const AVATARS = 'avatars';

const USER = 'user-1';

/** What the fake signer was asked to sign. */
interface SignedCall {
  command: PutObjectCommand;
  expiresIn: number;
}

/** A signer that records what it signed and resolves to a fixed URL. */
function signer(fail?: Error) {
  const calls: SignedCall[] = [];
  const sign: SignUploadUrl = async (command, options) => {
    if (fail) throw fail;
    calls.push({ command, expiresIn: options.expiresIn });
    return 'https://signed.test/upload';
  };
  return { calls, sign };
}

/** A HEAD that reports an object of the given size. */
function headOf(bytes: number) {
  return jest.fn().mockResolvedValue({ ContentLength: bytes });
}

/** A HEAD that fails, which is how S3 reports a key that is not there. */
function headMissing() {
  return jest.fn().mockRejectedValue(Object.assign(new Error('NotFound'), { name: 'NotFound' }));
}

function build(send: jest.Mock, overrides: Record<string, unknown> = {}) {
  return createStorageService({
    region: REGION,
    selfiesBucket: SELFIES,
    jobImagesBucket: JOB_IMAGES,
    avatarsBucket: AVATARS,
    publicBaseUrl: null,
    s3: { send } as unknown as S3Client,
    signUploadUrl: signer().sign,
    ...overrides,
  });
}

describe('createStorageService', () => {
  describe('minted upload URLs', () => {
    it('signs a PUT scoped to the verified user, never to client input', async () => {
      const { calls, sign } = signer();
      const storage = build(jest.fn(), { signUploadUrl: sign });

      const { path, uploadUrl } = await storage.createSelfieUpload(USER);

      expect(path).toBe(`pros/${USER}/selfie.jpg`);
      expect(uploadUrl).toBe('https://signed.test/upload');
      expect(calls[0]?.command).toBeInstanceOf(PutObjectCommand);
      expect(calls[0]?.command.input).toMatchObject({
        Bucket: SELFIES,
        Key: `pros/${USER}/selfie.jpg`,
      });
    });

    // The clients PUT with `content-type: image/jpeg`. Signing the content type
    // is what makes S3 reject anything else, since S3 has no bucket-level
    // allowed_mime_types the way Supabase Storage did.
    it('signs the content type, so S3 rejects a mismatched header', async () => {
      const { calls, sign } = signer();
      const storage = build(jest.fn(), { signUploadUrl: sign });

      await storage.createSelfieUpload(USER);

      expect(calls[0]?.command.input.ContentType).toBe('image/jpeg');
    });

    it('keeps the URL short-lived', async () => {
      const { calls, sign } = signer();
      const storage = build(jest.fn(), { signUploadUrl: sign });

      await storage.createSelfieUpload(USER);

      expect(calls[0]?.expiresIn).toBe(300);
    });

    it('scopes a job image under the requesting customer and never reuses a key', async () => {
      const storage = build(jest.fn());

      const first = await storage.createJobImageUpload(USER);
      const second = await storage.createJobImageUpload(USER);

      expect(first.path).toMatch(new RegExp(`^jobs/${USER}/[0-9a-f-]{36}\\.jpg$`));
      expect(second.path).not.toBe(first.path);
    });

    it('scopes an avatar under the surface it was uploaded for', async () => {
      const storage = build(jest.fn());

      expect(storage.avatarScope('customer', USER)).toBe(`customers/${USER}/`);
      expect(storage.avatarScope('pro', USER)).toBe(`pros/${USER}/`);
    });

    it('surfaces a signing failure as a 502 rather than leaking the SDK error', async () => {
      const storage = build(jest.fn(), {
        signUploadUrl: signer(new Error('no credentials in this environment')).sign,
      });

      await expect(storage.createSelfieUpload(USER)).rejects.toMatchObject({
        status: 502,
        code: 'INTERNAL',
      });
    });
  });

  describe('existence checks', () => {
    it('confirms an object that landed', async () => {
      const send = headOf(1_024);
      const storage = build(send);

      await expect(storage.selfieExists(USER)).resolves.toBe(true);
      expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    });

    it('reports a missing object as absent so the client can retry', async () => {
      const storage = build(headMissing());

      await expect(storage.selfieExists(USER)).resolves.toBe(false);
    });

    it('treats an unreportable length as absent rather than trusting the payload', async () => {
      // ContentLength missing is not a size of zero; it is an unknown payload.
      const storage = build(jest.fn().mockResolvedValue({}));

      await expect(storage.selfieExists(USER)).resolves.toBe(false);
    });

    it('checks the path the server minted, not one the caller chose', async () => {
      const send = headOf(512);
      const storage = build(send);

      await storage.selfieExists(USER);

      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: SELFIES,
        Key: `pros/${USER}/selfie.jpg`,
      });
    });

    it('checks a job image in the job-images bucket', async () => {
      const send = headOf(512);
      const storage = build(send);

      await storage.jobImageExists(`jobs/${USER}/photo.jpg`);

      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: JOB_IMAGES,
        Key: `jobs/${USER}/photo.jpg`,
      });
    });
  });

  describe('size limits', () => {
    // S3 has no per-bucket file_size_limit the way Supabase Storage did, so
    // this is the only enforcement there is. Without it an oversize photo would
    // be recorded on the profile and served back to every client.
    it('accepts a selfie exactly at the limit', async () => {
      const storage = build(headOf(SELFIE_MAX_BYTES));

      await expect(storage.selfieExists(USER)).resolves.toBe(true);
    });

    it('rejects an oversize selfie with 422 instead of retryable conflict', async () => {
      const storage = build(headOf(SELFIE_MAX_BYTES + 1));

      await expect(storage.selfieExists(USER)).rejects.toMatchObject({
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    });

    it('applies the job-image limit, which is larger than the selfie limit', async () => {
      expect(JOB_IMAGE_MAX_BYTES).toBeGreaterThan(SELFIE_MAX_BYTES);

      const withinJobLimit = build(headOf(SELFIE_MAX_BYTES + 1));
      await expect(withinJobLimit.jobImageExists(`jobs/${USER}/p.jpg`)).resolves.toBe(true);

      const oversize = build(headOf(JOB_IMAGE_MAX_BYTES + 1));
      await expect(oversize.jobImageExists(`jobs/${USER}/p.jpg`)).rejects.toMatchObject({
        status: 422,
      });
    });

    it('applies the avatar limit', async () => {
      const storage = build(headOf(AVATAR_MAX_BYTES + 1));

      await expect(storage.avatarExists(`customers/${USER}/a.jpg`)).rejects.toMatchObject({
        status: 422,
      });
    });

    it('names the limit in the message so the client can tell the user', async () => {
      const storage = build(headOf(SELFIE_MAX_BYTES + 1));

      await expect(storage.selfieExists(USER)).rejects.toThrow(/5 MiB limit/);
    });
  });

  describe('public URLs', () => {
    it('builds regional S3 URLs by default', () => {
      const storage = build(jest.fn());

      expect(storage.selfiePublicUrl('pros/1/selfie.jpg')).toBe(
        `https://${SELFIES}.s3.${REGION}.amazonaws.com/pros/1/selfie.jpg`,
      );
      expect(storage.jobImagePublicUrl('jobs/1/a.jpg')).toBe(
        `https://${JOB_IMAGES}.s3.${REGION}.amazonaws.com/jobs/1/a.jpg`,
      );
      expect(storage.avatarPublicUrl('pros/1/a.jpg')).toBe(
        `https://${AVATARS}.s3.${REGION}.amazonaws.com/pros/1/a.jpg`,
      );
    });

    it('routes every bucket through an explicit base URL when one is set', () => {
      // The single seam for putting a CDN in front later.
      const storage = build(jest.fn(), { publicBaseUrl: 'https://cdn.test' });

      expect(storage.selfiePublicUrl('pros/1/selfie.jpg')).toBe(
        'https://cdn.test/pros/1/selfie.jpg',
      );
      expect(storage.avatarPublicUrl('pros/1/a.jpg')).toBe('https://cdn.test/pros/1/a.jpg');
    });
  });

  describe('removeAvatar', () => {
    it('deletes the object behind a URL it previously handed out', async () => {
      const send = jest.fn().mockResolvedValue({});
      const storage = build(send);
      const url = storage.avatarPublicUrl(`customers/${USER}/avatar-1.jpg`);

      await storage.removeAvatar(url);

      expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
      expect(send.mock.calls[0][0].input).toMatchObject({
        Bucket: AVATARS,
        Key: `customers/${USER}/avatar-1.jpg`,
      });
    });

    it('refuses to delete anything outside the avatars bucket', async () => {
      const send = jest.fn().mockResolvedValue({});
      const storage = build(send);

      await storage.removeAvatar('https://evil.test/whatever.jpg');
      await storage.removeAvatar(`https://${SELFIES}.s3.${REGION}.amazonaws.com/pros/1/selfie.jpg`);
      await storage.removeAvatar(null);
      await storage.removeAvatar(undefined);

      expect(send).not.toHaveBeenCalled();
    });

    it('never throws on a failed delete — the replace is already recorded', async () => {
      const storage = build(jest.fn().mockRejectedValue(new Error('AccessDenied')));

      await expect(
        storage.removeAvatar(`https://${AVATARS}.s3.${REGION}.amazonaws.com/customers/1/a.jpg`),
      ).resolves.toBeUndefined();
    });
  });
});
