import {
  routerRequest,
  type ProviderCapability,
  type RouterCallerAuth,
  type RouterDispatchResponse,
} from './client';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  preferredProvider?:
    | 'orbitmail'
    | 'resend'
    | 'brevo'
    | 'sendpulse'
    | 'aws_ses'
    | 'sendgrid'
    | 'cloudflare'
    | 'apps_script'
    | 'custom_webhook';
}

export interface SendEmailResult {
  messageId?: string;
  accepted: boolean;
}

/**
 * Requests the backend email router (`/api/v1/router/email/send`) to dispatch an email.
 * The backend verifies the caller, selects the active provider from secrets,
 * and falls back automatically if quota/limits are exhausted.
 */
export function sendEmail(
  input: SendEmailInput,
  auth?: RouterCallerAuth
): Promise<RouterDispatchResponse<SendEmailResult>> {
  return routerRequest<RouterDispatchResponse<SendEmailResult>>('/email/send', {
    method: 'POST',
    body: JSON.stringify(input),
    auth,
  });
}

export async function getEmailProviders(auth?: RouterCallerAuth): Promise<ProviderCapability[]> {
  const res = await routerRequest<{ success: boolean; data: ProviderCapability[] }>(
    '/email/providers',
    { method: 'GET', auth }
  );
  return res.data;
}
