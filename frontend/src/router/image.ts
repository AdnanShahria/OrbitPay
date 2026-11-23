import {
  routerRequest,
  type ProviderCapability,
  type RouterCallerAuth,
  type RouterDispatchResponse,
} from './client';

export type ImageProvider = 'r2' | 'imgbb' | 'supabase' | 'mongodb' | 'd1';

export interface UploadedImageData {
  assetId: string;
  url: string;
  externalUrl?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface Base64ImageUploadInput {
  fileName: string;
  mimeType: string;
  base64: string;
  preferredProvider?: ImageProvider;
}

/**
 * Uploads an image via `/api/v1/router/image/upload`.
 * The backend decides storage placement & fallbacks (R2 -> ImgBB -> Supabase -> MongoDB -> D1).
 */
export function uploadImage(
  fileOrInput: File | Base64ImageUploadInput,
  auth?: RouterCallerAuth,
  preferredProvider?: ImageProvider
): Promise<RouterDispatchResponse<UploadedImageData>> {
  if (fileOrInput instanceof File) {
    const formData = new FormData();
    formData.append('file', fileOrInput);
    if (preferredProvider) {
      formData.append('preferredProvider', preferredProvider);
    }
    return routerRequest<RouterDispatchResponse<UploadedImageData>>('/image/upload', {
      method: 'POST',
      body: formData,
      isMultipart: true,
      auth,
    });
  }

  return routerRequest<RouterDispatchResponse<UploadedImageData>>('/image/upload', {
    method: 'POST',
    body: JSON.stringify(fileOrInput),
    auth,
  });
}

/**
 * Returns the canonical URL that transparently resolves and streams the image
 * from whichever primary or fallback storage backend holds it.
 */
export function getImageUrl(assetId: string): string {
  return `/api/v1/router/image/${encodeURIComponent(assetId)}`;
}

export function deleteImage(
  assetId: string,
  auth?: RouterCallerAuth
): Promise<{ success: boolean; data: { deleted: boolean; assetId: string } }> {
  return routerRequest(`/image/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    auth,
  });
}

export async function getImageProviders(auth?: RouterCallerAuth): Promise<ProviderCapability[]> {
  const res = await routerRequest<{ success: boolean; data: ProviderCapability[] }>(
    '/image/providers',
    { method: 'GET', auth }
  );
  return res.data;
}
