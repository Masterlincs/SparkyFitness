import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useServerConnection } from '../hooks/useServerConnection';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { flushOfflineFoodQueue } from '../services/offlineFoodLog';
import { addLog } from '../services/LogService';
import { getErrorMessage } from '../utils/errors';

/**
 * Sends food logged offline once the server answers again. The connection
 * check already re-runs on focus, on app return and after a failed request, so
 * becoming connected is the one signal needed.
 */
const OfflineFoodQueueFlusher: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    flushOfflineFoodQueue()
      .then((result) => {
        if (cancelled || result.sent === 0) return;
        for (const date of result.dates) invalidateFoodCache(queryClient, date);
        Toast.show({
          type: 'success',
          text1: t('offlineFood.synced', {
            count: result.sent,
            defaultValue: 'Added {{count}} foods logged offline',
            defaultValue_one: 'Added {{count}} food logged offline',
            defaultValue_other: 'Added {{count}} foods logged offline',
          }),
        });
      })
      .catch((error: unknown) => {
        addLog('Offline food queue failed to send', 'WARNING', [
          getErrorMessage(error),
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, queryClient, t]);

  return null;
};

export default OfflineFoodQueueFlusher;
