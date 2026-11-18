import { apiFetch } from './apiClient';
import type { QuickLogBody, QuickLogMatchResponse } from '@workspace/shared';

const SERVICE = 'Quick Log API';

export const matchQuickLogText = (
  text: string
): Promise<QuickLogMatchResponse> =>
  apiFetch<QuickLogMatchResponse>({
    endpoint: '/api/v2/quick-log/match',
    method: 'POST',
    body: { text },
    serviceName: SERVICE,
    operation: 'match spoken foods',
  });

export const submitQuickLog = (body: QuickLogBody): Promise<unknown> =>
  apiFetch<unknown>({
    endpoint: '/api/v2/quick-log',
    method: 'POST',
    body,
    serviceName: SERVICE,
    operation: 'log spoken foods',
  });
