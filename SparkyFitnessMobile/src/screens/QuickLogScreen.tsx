import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type {
  QuickLogCandidate,
  QuickLogItem,
  QuickLogMatchItem,
} from '@workspace/shared';

import Button from '../components/ui/Button';
import ServerGate from '../components/ServerGate';
import SystemVoiceDictationButton from '../components/chat/SystemVoiceDictationButton';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMealTypes } from '../hooks';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { getMealTypeLabel } from '../constants/meals';
import { matchQuickLogText, submitQuickLog } from '../services/api/quickLogApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatEnergy } from '../utils/energyUnit';
import { getTodayDate } from '../utils/dateUtils';
import { parseDecimalInput } from '../utils/numericInput';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'QuickLog'>;

interface RowChoice {
  include: boolean;
  candidate: number;
  variant: number;
  quantity: string;
}

const candidatesOf = (item: QuickLogMatchItem): QuickLogCandidate[] =>
  item.match ? [item.match, ...item.alternatives] : [];

const initialChoice = (item: QuickLogMatchItem): RowChoice => ({
  include: item.match !== null,
  candidate: 0,
  variant: item.match?.variant_index ?? 0,
  quantity: item.match ? String(item.match.quantity) : '',
});

const Chip: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
}> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${
      selected
        ? 'bg-accent-primary border-accent-primary'
        : 'border-border-subtle'
    }`}
  >
    <Text
      className={selected ? 'text-white text-sm' : 'text-text-primary text-sm'}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * Logs a meal from one sentence ("two eggs and a slice of toast"): dictated
 * with the phone's speech recognition or typed, matched on the server to the
 * person's foods and the UK datasets, checked here, then logged in one go.
 */
const QuickLogScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const energyUnit = useEnergyUnit();
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];
  const date = route.params?.date ?? getTodayDate();
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [mealTypeId, setMealTypeId] = useState<string | null>(
    route.params?.mealTypeId ?? null
  );
  const chosenMealType = mealTypeId ?? defaultMealTypeId;
  const [text, setText] = useState('');
  const [items, setItems] = useState<QuickLogMatchItem[]>([]);
  const [choices, setChoices] = useState<RowChoice[]>([]);
  const [matching, setMatching] = useState(false);
  const [logging, setLogging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const getText = useCallback(() => text, [text]);
  const noop = useCallback(() => {}, []);

  const header = useScreenHeader({
    title: t('quickLog.title', { defaultValue: 'Log by voice or text' }),
    left: { kind: 'back' },
  });

  const updateChoice = (index: number, patch: Partial<RowChoice>) =>
    setChoices((current) =>
      current.map((choice, i) =>
        i === index ? { ...choice, ...patch } : choice
      )
    );

  const handleFind = async () => {
    setMatching(true);
    try {
      const result = await matchQuickLogText(text);
      setItems(result.items);
      setChoices(result.items.map(initialChoice));
    } catch {
      Toast.show({
        type: 'error',
        text1: t('quickLog.matchFailed', {
          defaultValue: 'Could not look up those foods',
        }),
      });
    } finally {
      setMatching(false);
    }
  };

  const selected = items.flatMap((item, index) => {
    const choice = choices[index];
    const candidate = choice ? candidatesOf(item)[choice.candidate] : undefined;
    const variant = candidate?.variants[choice?.variant ?? 0];
    const quantity = parseDecimalInput(choice?.quantity);
    if (!choice?.include || !candidate || !variant || !(quantity > 0))
      return [];
    return [{ candidate, variant, quantity }];
  });

  const totalCalories = selected.reduce(
    (sum, { variant, quantity }) =>
      sum + (variant.calories * quantity) / (variant.serving_size || 1),
    0
  );

  const handleLog = async () => {
    if (!chosenMealType || selected.length === 0) return;
    const body: QuickLogItem[] = selected.map(
      ({ candidate, variant, quantity }) =>
        candidate.source === 'library'
          ? {
              source: 'library',
              food_id: candidate.food_id ?? '',
              variant_id: String(variant.id ?? ''),
              quantity,
              unit: variant.serving_unit,
            }
          : {
              source: candidate.source,
              provider_external_id: candidate.provider_external_id ?? '',
              serving_size: variant.serving_size,
              serving_unit: variant.serving_unit,
              quantity,
            }
    );
    setLogging(true);
    try {
      await submitQuickLog({
        entry_date: date,
        meal_type_id: chosenMealType,
        items: body,
      });
      invalidateFoodCache(queryClient, date);
      Toast.show({
        type: 'success',
        text1: t('quickLog.logged', {
          count: selected.length,
          defaultValue: 'Logged {{count}} foods',
          defaultValue_one: 'Logged {{count}} food',
          defaultValue_other: 'Logged {{count}} foods',
        }),
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('quickLog.logFailed', {
          defaultValue: 'Could not log the foods',
        }),
      });
    } finally {
      setLogging(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ServerGate>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <Text className="text-text-secondary text-sm mb-2">
            {t('quickLog.description', {
              defaultValue:
                'Say or type what you ate, for example "two eggs and a slice of toast". Check the matches, then log them all at once.',
            })}
          </Text>
          <View className="flex-row items-start gap-2">
            <TextInput
              className="flex-1 bg-surface text-text-primary rounded-lg px-3 py-2.5"
              style={{ minHeight: 72, textAlignVertical: 'top' }}
              multiline
              value={text}
              onChangeText={setText}
              editable={!recording && !voiceBusy}
              maxLength={1000}
              placeholder={t('quickLog.placeholder', {
                defaultValue: 'two eggs, a slice of toast and a cup of tea',
              })}
              accessibilityLabel={t('quickLog.textLabel', {
                defaultValue: 'What did you eat?',
              })}
            />
            <SystemVoiceDictationButton
              getText={getText}
              setText={setText}
              textPrimary={textPrimary}
              recording={recording}
              busy={voiceBusy}
              onRecordingChange={setRecording}
              onBusyChange={setVoiceBusy}
              onVolumeChange={noop}
            />
          </View>
          <View className="flex-row flex-wrap mt-3">
            {mealTypes.map((type) => (
              <Chip
                key={type.id}
                label={getMealTypeLabel(type.name)}
                selected={chosenMealType === type.id}
                onPress={() => setMealTypeId(type.id)}
              />
            ))}
          </View>
          <Button
            onPress={handleFind}
            disabled={!text.trim() || matching || recording || voiceBusy}
          >
            {t('quickLog.find', { defaultValue: 'Find foods' })}
          </Button>
          {matching && <ActivityIndicator className="mt-4" />}

          {items.map((item, index) => {
            const choice = choices[index] ?? initialChoice(item);
            const candidates = candidatesOf(item);
            const candidate = candidates[choice.candidate];
            return (
              <View
                key={`${item.phrase.raw}-${index}`}
                className="mt-4 p-3 rounded-xl bg-surface"
              >
                <Pressable
                  onPress={() =>
                    candidate &&
                    updateChoice(index, { include: !choice.include })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: choice.include,
                    disabled: !candidate,
                  }}
                >
                  <Text
                    className={`text-base font-semibold ${
                      choice.include
                        ? 'text-text-primary'
                        : 'text-text-muted line-through'
                    }`}
                  >
                    {item.phrase.raw}
                  </Text>
                </Pressable>
                {candidate ? (
                  <>
                    <Text className="text-text-secondary text-xs mt-2 mb-1">
                      {t('quickLog.food', { defaultValue: 'Food' })}
                    </Text>
                    <View className="flex-row flex-wrap">
                      {candidates.map((option, optionIndex) => (
                        <Chip
                          key={optionIndex}
                          label={option.name}
                          selected={choice.candidate === optionIndex}
                          onPress={() =>
                            updateChoice(index, {
                              candidate: optionIndex,
                              variant: option.variant_index,
                              quantity: String(option.quantity),
                            })
                          }
                        />
                      ))}
                    </View>
                    <Text className="text-text-secondary text-xs mt-1 mb-1">
                      {t('quickLog.portion', { defaultValue: 'Portion' })}
                    </Text>
                    <View className="flex-row flex-wrap">
                      {candidate.variants.map((variant, variantIndex) => (
                        <Chip
                          key={variantIndex}
                          label={
                            variant.serving_size === 1
                              ? variant.serving_unit
                              : `${variant.serving_size} ${variant.serving_unit}`
                          }
                          selected={choice.variant === variantIndex}
                          onPress={() =>
                            updateChoice(index, { variant: variantIndex })
                          }
                        />
                      ))}
                    </View>
                    <TextInput
                      className="bg-background text-text-primary rounded-lg px-3 py-2 w-28 mt-1"
                      value={choice.quantity}
                      onChangeText={(value) =>
                        updateChoice(index, { quantity: value })
                      }
                      keyboardType="decimal-pad"
                      accessibilityLabel={t('quickLog.quantity', {
                        defaultValue: 'Quantity',
                      })}
                    />
                  </>
                ) : (
                  <Text className="text-text-secondary text-sm mt-2">
                    {t('quickLog.noMatchMobile', {
                      defaultValue:
                        'No match found. Search for it from Add Food, or ask Sparky.',
                    })}
                  </Text>
                )}
              </View>
            );
          })}

          {items.length > 0 && (
            <View className="mt-4">
              <Button
                onPress={handleLog}
                disabled={selected.length === 0 || !chosenMealType || logging}
              >
                {t('quickLog.logButton', {
                  count: selected.length,
                  energy: formatEnergy(totalCalories, energyUnit, t),
                  defaultValue: 'Log {{count}} foods ({{energy}})',
                  defaultValue_one: 'Log {{count}} food ({{energy}})',
                  defaultValue_other: 'Log {{count}} foods ({{energy}})',
                })}
              </Button>
            </View>
          )}
        </ScrollView>
      </ServerGate>
    </View>
  );
};

export default QuickLogScreen;
