import { useMutation } from '@tanstack/react-query';
import i18n from 'i18next';
import type { QuickLogBody } from '@workspace/shared';
import { matchQuickLogText, submitQuickLog } from '@/api/Foods/quickLogService';
import { useFoodEntryInvalidation } from '@/hooks/useInvalidateKeys';

export const useMatchQuickLogMutation = () =>
  useMutation({
    mutationFn: (text: string) => matchQuickLogText(text),
    meta: {
      errorMessage: i18n.t(
        'quickLog.failedToMatch',
        'Could not look up those foods.'
      ),
    },
  });

export const useSubmitQuickLogMutation = () => {
  const invalidate = useFoodEntryInvalidation();
  return useMutation({
    mutationFn: (body: QuickLogBody) => submitQuickLog(body),
    onSuccess: invalidate,
    meta: {
      errorMessage: i18n.t('quickLog.failedToLog', 'Could not log the foods.'),
    },
  });
};
