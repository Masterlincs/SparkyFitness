import { api } from '@/api/api';
import type { QuickLogBody, QuickLogMatchResponse } from '@workspace/shared';

export const matchQuickLogText = (
  text: string
): Promise<QuickLogMatchResponse> =>
  api.post('/v2/quick-log/match', { body: { text } });

export const submitQuickLog = (body: QuickLogBody): Promise<unknown> =>
  api.post('/v2/quick-log', { body });
