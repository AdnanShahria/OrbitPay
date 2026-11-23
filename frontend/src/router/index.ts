import { routerRequest, type ProviderCapability, type RouterCallerAuth } from './client';

export * from './client';
export * from './email';
export * from './sms';
export * from './image';
export * from './database';

export interface RouterHealthSnapshot {
  timestamp: string;
  channels: {
    email: ProviderCapability[];
    sms: ProviderCapability[];
    image: ProviderCapability[];
    database: ProviderCapability[];
  };
}

export async function getRouterHealth(auth?: RouterCallerAuth): Promise<RouterHealthSnapshot> {
  const res = await routerRequest<{ success: boolean; data: RouterHealthSnapshot }>('/health', {
    method: 'GET',
    auth,
  });
  return res.data;
}

export async function getRouterLogs(auth?: RouterCallerAuth): Promise<unknown[]> {
  const res = await routerRequest<{ success: boolean; data: unknown[] }>('/logs', {
    method: 'GET',
    auth,
  });
  return res.data;
}
