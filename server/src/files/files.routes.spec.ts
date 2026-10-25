import request from 'supertest';
import express from 'express';
import { ApiErrorCode } from '@samona/types';
import type { Services } from '../context';
import { errorHandler } from '../common/middleware/error-handler';
import { createFilesRouter } from './files.routes';

const AVATAR_BASE = 'https://avatars.s3.us-east-1.amazonaws.com';

const activeCustomer = {
  id: 'user-1',
  appType: 'customer' as const,
  isAdmin: false,
  phone: '+919876543210',
  email: null,
  fullName: null,
  isActive: true,
  createdAt: new Date(),
};

function avatarPublicUrl(path: string): string {
  return `${AVATAR_BASE}/${path}`;
}

function buildServices(overrides: Partial<Services> = {}) {
  return {
    tokenVerifier: {
      verify: jest
        .fn()
        .mockResolvedValue({ userId: activeCustomer.id, phone: activeCustomer.phone, email: null }),
    },
    auth: { syncUser: jest.fn().mockResolvedValue(activeCustomer) },
    storage: {
      createSelfieUpload: jest.fn(),
      selfieExists: jest.fn(),
      selfiePublicUrl: jest.fn(),
      selfiePath: jest.fn(),
      createJobImageUpload: jest.fn(),
      jobImageExists: jest.fn(),
      jobImagePublicUrl: jest.fn(),
      createAvatarUpload: jest.fn().mockResolvedValue({
        path: 'customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg',
        uploadUrl: 'https://avatars.s3.us-east-1.amazonaws.com/signed?...',
      }),
      avatarExists: jest.fn().mockResolvedValue(true),
      avatarPublicUrl,
      avatarScope: (surface: 'customer' | 'pro', userId: string) => `${surface}s/${userId}/`,
      removeAvatar: jest.fn().mockResolvedValue(undefined),
      selfiesBucket: 'pro-selfies',
      avatarsBucket: 'avatars',
      bannersBucket: null,
      documentsBucket: 'pro-documents',
      removeObjectPrefix: jest.fn().mockResolvedValue(undefined),
    },
    customers: {
      ensureForUser: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue({
        id: 'cp-1',
        userId: 'user-1',
        onboardingStatus: 'COMPLETED',
        displayName: 'Avi',
        gender: null,
        locationLabel: null,
        latitude: null,
        longitude: null,
        avatarUrl: null,
      }),
      applyOnboardingPatch: jest.fn().mockResolvedValue({
        id: 'cp-1',
        userId: 'user-1',
        onboardingStatus: 'COMPLETED',
        displayName: 'Avi',
        gender: null,
        locationLabel: null,
        latitude: null,
        longitude: null,
        avatarUrl: `${AVATAR_BASE}/customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg`,
      }),
    },
    ...overrides,
  } as unknown as Services;
}

function appWith(services: Services) {
  return express().use(express.json()).use('/files', createFilesRouter(services)).use(errorHandler);
}

describe('files routes — avatar', () => {
  it('POST /files/avatar/upload-url mints a fresh ticket under the caller id', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/files/avatar/upload-url')
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(200);

    expect(services.storage.createAvatarUpload).toHaveBeenCalledWith('customer', 'user-1');
    expect(response.body.path).toBe(
      'customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg',
    );
    expect(response.body.uploadUrl).toBeDefined();
  });

  it('POST /files/avatar/complete records the public URL and removes the previous avatar', async () => {
    const previousUrl = `${AVATAR_BASE}/customers/user-1/avatar-22222222-2222-2222-2222-222222222222.jpg`;
    const services = buildServices({
      customers: {
        ensureForUser: jest.fn(),
        findByUserId: jest.fn().mockResolvedValue({
          id: 'cp-1',
          userId: 'user-1',
          avatarUrl: previousUrl,
        }),
        applyOnboardingPatch: jest.fn().mockResolvedValue({
          id: 'cp-1',
          userId: 'user-1',
          avatarUrl: `${AVATAR_BASE}/customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg`,
        }),
        updateLocation: jest.fn(),
      },
    });

    const response = await request(appWith(services))
      .post('/files/avatar/complete')
      .send({ path: 'customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg' })
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(200);

    expect(services.storage.avatarExists).toHaveBeenCalledWith(
      'customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg',
    );
    expect(services.customers.applyOnboardingPatch).toHaveBeenCalledWith('user-1', {
      avatarUrl: `${AVATAR_BASE}/customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg`,
    });
    expect(services.storage.removeAvatar).toHaveBeenCalledWith(previousUrl);
    expect(response.body.avatarUrl).toBe(
      `${AVATAR_BASE}/customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg`,
    );
  });

  it('does not try to remove an avatar the account never had', async () => {
    const services = buildServices();
    await request(appWith(services))
      .post('/files/avatar/complete')
      .send({ path: 'customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg' })
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(200);

    expect(services.storage.removeAvatar).toHaveBeenCalledWith(null);
  });

  it('rejects a path scoped under another customer', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/files/avatar/complete')
      .send({ path: 'customers/user-2/avatar-99999999-9999-9999-9999-999999999999.jpg' })
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(400);

    expect(response.body.error.code).toBe(ApiErrorCode.BAD_REQUEST);
    expect(services.customers.applyOnboardingPatch).not.toHaveBeenCalled();
    expect(services.storage.removeAvatar).not.toHaveBeenCalled();
  });

  it('rejects a path whose object never reached storage', async () => {
    const services = buildServices({
      storage: {
        createSelfieUpload: jest.fn(),
        selfieExists: jest.fn(),
        selfiePublicUrl: jest.fn(),
        selfiePath: jest.fn(),
        createJobImageUpload: jest.fn(),
        jobImageExists: jest.fn(),
        jobImagePublicUrl: jest.fn(),
        createAvatarUpload: jest.fn(),
        avatarExists: jest.fn().mockResolvedValue(false),
        avatarPublicUrl,
        avatarScope: (surface: 'customer' | 'pro', userId: string) => `${surface}s/${userId}/`,
        removeAvatar: jest.fn(),
        createDocumentUpload: jest.fn(),
        documentObjectInfo: jest.fn(),
        documentContentUrl: jest.fn(),
        documentScope: (userId: string) => `pros/${userId}/documents/`,
        removeDocument: jest.fn(),
        selfiesBucket: 'pro-selfies',
        avatarsBucket: 'avatars',
        bannersBucket: null,
        documentsBucket: 'pro-documents',
        removeObjectPrefix: jest.fn().mockResolvedValue(undefined),
        listObjects: jest.fn(),
        deleteObjects: jest.fn(),
        deleteObject: jest.fn(),
        keyFromAvatarUrl: jest.fn(),
        jobImagesBucket: 'job-images',
      },
    });

    const response = await request(appWith(services))
      .post('/files/avatar/complete')
      .send({ path: 'customers/user-1/avatar-3f9c2175-09f4-4360-b19a-3a5447b9f4f2.jpg' })
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(409);

    expect(response.body.error.code).toBe(ApiErrorCode.CONFLICT);
    expect(services.customers.applyOnboardingPatch).not.toHaveBeenCalled();
  });

  it('rejects a malformed avatar path before any storage call', async () => {
    const services = buildServices();
    const response = await request(appWith(services))
      .post('/files/avatar/complete')
      .send({ path: 'etc/passwd' })
      .set('authorization', 'Bearer good.token')
      .set('x-app-type', 'customer')
      .expect(422);

    expect(response.body.error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(services.storage.avatarExists).not.toHaveBeenCalled();
  });

  it('requires a valid session', async () => {
    await request(appWith(buildServices())).post('/files/avatar/complete').send({}).expect(401);
  });
});
