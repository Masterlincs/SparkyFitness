import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable } from 'react-native';
import { getLocales } from 'expo-localization';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import Toast from 'react-native-toast-message';
import Icon from '../Icon';
import {
  useVoiceInputLifecycle,
  type VoiceCancellationReason,
} from '../../hooks/useVoiceInputLifecycle';
import { addLog } from '../../services/LogService';
import { resolveSpeechLocale } from '../../utils/speechLocale';

/**
 * System dictation button: taps the platform speech recognizer (Google/Samsung
 * on Android, SFSpeechRecognizer on iOS) and streams the transcript into the
 * text field. The OS recognizer may use its own cloud service; no configured
 * Sparky AI provider is called. Sending stays manual for proofreading.
 */
export default function SystemVoiceDictationButton({
  getText,
  setText,
  textPrimary,
  recording,
  busy,
  onRecordingChange,
  onBusyChange,
  onVolumeChange,
}: {
  /** Current text the dictation appends to. */
  getText: () => string;
  setText: (text: string) => void;
  textPrimary: string;
  recording: boolean;
  busy: boolean;
  onRecordingChange: (recording: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onVolumeChange: (volume: number) => void;
}) {
  const { t, i18n } = useTranslation();
  // Text already present when dictation starts; final segments are appended.
  const baseTextRef = useRef('');
  const finalTranscriptRef = useRef('');
  // Kept in refs so press and event callbacks always see the latest props.
  const getTextRef = useRef(getText);
  const setTextRef = useRef(setText);
  useEffect(() => {
    getTextRef.current = getText;
    setTextRef.current = setText;
  }, [getText, setText]);

  const activeRef = useRef(false);
  const pendingRef = useRef(false);
  const sessionRef = useRef(0);
  const finish = useCallback(() => {
    activeRef.current = false;
    pendingRef.current = false;
    onRecordingChange(false);
    onBusyChange(false);
    onVolumeChange(0);
  }, [onBusyChange, onRecordingChange, onVolumeChange]);
  const cancel = useCallback(
    (reason: VoiceCancellationReason) => {
      ++sessionRef.current;
      activeRef.current = false;
      pendingRef.current = false;
      ExpoSpeechRecognitionModule.abort();
      if (reason !== 'unmount') finish();
    },
    [finish]
  );
  useVoiceInputLifecycle(cancel);

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) return;
    const transcript = event.results[0]?.transcript?.trim() ?? '';
    if (!transcript) return;

    if (event.isFinal) {
      finalTranscriptRef.current = [finalTranscriptRef.current, transcript]
        .filter(Boolean)
        .join(' ');
    }
    const recognized = event.isFinal
      ? finalTranscriptRef.current
      : [finalTranscriptRef.current, transcript].filter(Boolean).join(' ');
    setTextRef.current(
      [baseTextRef.current, recognized].filter(Boolean).join(' ')
    );
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (activeRef.current)
      onVolumeChange(Math.max(0, Math.min(1, (event.value + 2) / 12)));
  });

  useSpeechRecognitionEvent('nomatch', () => {
    if (!activeRef.current) return;
    finish();
    Toast.show({
      type: 'info',
      text1: t('chat.voice.noSpeechTitle', {
        defaultValue: 'No speech detected',
      }),
      text2: t('chat.voice.noSpeechMessage', {
        defaultValue: 'Try again and speak closer to the microphone.',
      }),
    });
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current) return;
    finish();
    if (event.error === 'aborted') return;

    const noSpeech =
      event.error === 'no-speech' || event.error === 'speech-timeout';
    Toast.show({
      type: noSpeech ? 'info' : 'error',
      text1: noSpeech
        ? t('chat.voice.noSpeechTitle', { defaultValue: 'No speech detected' })
        : t('chat.voice.errorTitle', { defaultValue: 'Voice input failed' }),
      text2: noSpeech
        ? t('chat.voice.noSpeechMessage', {
            defaultValue: 'Try again and speak closer to the microphone.',
          })
        : event.message,
    });
  });

  useSpeechRecognitionEvent('end', () => {
    if (activeRef.current) finish();
  });

  const toggleDictation = useCallback(async () => {
    if (pendingRef.current) return;
    if (activeRef.current) {
      pendingRef.current = true;
      onBusyChange(true);
      onRecordingChange(false);
      onVolumeChange(0);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        finish();
      }
      // Wait for the final transcript/end event before allowing Send or editing.
      return;
    }
    const session = ++sessionRef.current;
    pendingRef.current = true;
    onBusyChange(true);
    try {
      const currentPermission =
        await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (sessionRef.current !== session) return;
      const permission = currentPermission.granted
        ? currentPermission
        : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (sessionRef.current !== session) return;
      if (!permission.granted) {
        finish();
        Alert.alert(
          t('chat.voice.permissionTitle', {
            defaultValue: 'Voice input needs the microphone',
          }),
          t('chat.voice.permissionMessage', {
            defaultValue:
              'Allow microphone and speech recognition in system settings to dictate messages.',
          })
        );
        return;
      }
      baseTextRef.current = getTextRef.current().trim();
      finalTranscriptRef.current = '';
      activeRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: resolveSpeechLocale(
          i18n.language,
          getLocales().map((locale) => locale.languageTag)
        ),
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
        ...(Platform.OS === 'android'
          ? {
              androidIntentOptions: {
                EXTRA_ENABLE_LANGUAGE_SWITCH: 'balanced' as const,
              },
            }
          : {}),
      });
      pendingRef.current = false;
      onBusyChange(false);
      onVolumeChange(0);
      onRecordingChange(true);
    } catch (error) {
      if (sessionRef.current !== session) return;
      finish();
      addLog(
        'chat.voice.start',
        'ERROR',
        error instanceof Error ? [error.message] : [String(error)]
      );
      Toast.show({
        type: 'error',
        text1: t('chat.voice.errorTitle', {
          defaultValue: 'Voice input failed',
        }),
      });
    }
  }, [
    finish,
    onBusyChange,
    onRecordingChange,
    onVolumeChange,
    t,
    i18n.language,
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        recording
          ? t('chat.voice.stop', { defaultValue: 'Stop dictation' })
          : t('chat.voice.label', { defaultValue: 'Dictate message' })
      }
      accessibilityState={{ selected: recording, disabled: busy }}
      disabled={busy}
      onPress={toggleDictation}
      className={
        recording
          ? 'bg-border-subtle rounded-full w-10 h-10 items-center justify-center'
          : 'rounded-full w-10 h-10 items-center justify-center'
      }
    >
      <Icon
        name={recording ? 'stop' : 'microphone'}
        size={recording ? 17 : 20}
        color={textPrimary}
      />
    </Pressable>
  );
}
