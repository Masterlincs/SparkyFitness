import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import Icon from './Icon';
import Button from './ui/Button';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { formatEnergy } from '../utils/energyUnit';
import { getTodayDate } from '../utils/dateUtils';
import { parseDecimalInput } from '../utils/numericInput';
import { getDefaultMealTypeId, getMealTypeLabel } from '../constants/meals';
import {
  getQueuedFoodEntries,
  loadOfflineFoodSnapshot,
  queueFoodEntry,
  type OfflineFoodSnapshot,
} from '../services/offlineFoodLog';
import type { FoodItem } from '../types/foods';

interface OfflineFoodQuickAddProps {
  /** Diary day to log to; today when absent. */
  date?: string;
  /** Meal type to preselect. */
  mealTypeId?: string;
  /** Called after an entry is queued. */
  onQueued: () => void;
}

/**
 * Food search with no connection: the foods saved on this phone the last time
 * search was used online, logged into a queue that is sent once the server
 * answers again.
 */
const OfflineFoodQuickAdd: React.FC<OfflineFoodQuickAddProps> = ({
  date,
  mealTypeId,
  onQueued,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [snapshot, setSnapshot] = useState<OfflineFoodSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [amount, setAmount] = useState('');
  const [mealType, setMealType] = useState<string | null>(mealTypeId ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([loadOfflineFoodSnapshot(), getQueuedFoodEntries()]).then(
      ([saved, queue]) => {
        if (!active) return;
        setSnapshot(saved);
        setWaiting(queue.length);
        setMealType(
          (current) =>
            current ?? (saved ? getDefaultMealTypeId(saved.mealTypes) : null)
        );
        setLoaded(true);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const foods = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const all = snapshot?.foods ?? [];
    return term
      ? all.filter((food) =>
          `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(term)
        )
      : all;
  }, [snapshot, filter]);

  const select = (food: FoodItem) => {
    setSelected(food);
    setAmount(String(food.default_variant.serving_size));
  };

  const quantity = parseDecimalInput(amount);
  const canAdd =
    !!selected?.default_variant.id &&
    !!mealType &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    !saving;

  const handleAdd = async () => {
    const variant = selected?.default_variant;
    if (!selected || !variant?.id || !mealType || !(quantity > 0)) return;
    setSaving(true);
    try {
      await queueFoodEntry(selected.name, {
        food_id: selected.id,
        variant_id: variant.id,
        meal_type_id: mealType,
        quantity,
        unit: variant.serving_unit,
        entry_date: date ?? getTodayDate(),
      });
      Toast.show({
        type: 'info',
        text1: t('offlineFood.queued', {
          defaultValue: 'Saved on your phone',
        }),
        text2: t('offlineFood.queuedDetail', {
          defaultValue:
            'It will be added to your diary when you are back online.',
        }),
      });
      onQueued();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('offlineFood.queueFailed', {
          defaultValue: 'Could not save the food on your phone',
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  if (!snapshot || snapshot.foods.length === 0) {
    return (
      <View className="flex-1 justify-center items-center px-6">
        <Icon name="cloud-offline" size={48} color={accentColor} />
        <Text className="text-text-secondary text-base mt-4 text-center">
          {t('offlineFood.noSnapshot', {
            defaultValue:
              'You are offline. Search foods once while connected and your recent foods will be available here to log offline.',
          })}
        </Text>
      </View>
    );
  }

  const header = (
    <View className="px-4 pt-4 pb-2 gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="cloud-offline" size={18} color={accentColor} />
        <Text className="text-text-primary text-base font-semibold flex-1">
          {t('offlineFood.title', {
            defaultValue: 'Offline: your saved foods',
          })}
        </Text>
      </View>
      <Text className="text-text-secondary text-sm">
        {waiting > 0
          ? t('offlineFood.waiting', {
              count: waiting,
              defaultValue:
                '{{count}} foods are waiting to be sent when you are back online.',
              defaultValue_one:
                '{{count}} food is waiting to be sent when you are back online.',
              defaultValue_other:
                '{{count}} foods are waiting to be sent when you are back online.',
            })
          : t('offlineFood.hint', {
              defaultValue:
                'Foods you log now are kept on your phone and added to your diary when you reconnect.',
            })}
      </Text>
      <TextInput
        className="bg-surface-secondary text-text-primary rounded-lg px-3 py-2"
        value={filter}
        onChangeText={setFilter}
        placeholder={t('offlineFood.filter', { defaultValue: 'Filter foods' })}
        accessibilityLabel={t('offlineFood.filter', {
          defaultValue: 'Filter foods',
        })}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={foods}
        keyExtractor={(food) => food.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: food }) => {
          const variant = food.default_variant;
          const isSelected = selected?.id === food.id;
          return (
            <View className="px-4">
              <Pressable
                onPress={() => select(food)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`py-3 border-b border-border-subtle ${isSelected ? 'opacity-100' : ''}`}
              >
                <Text className="text-text-primary text-base">{food.name}</Text>
                <Text className="text-text-secondary text-sm">
                  {[
                    food.brand,
                    `${variant.serving_size} ${variant.serving_unit}`,
                    formatEnergy(variant.calories, energyUnit, t),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
              {isSelected && (
                <View className="py-3 gap-3">
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      className="bg-surface-secondary text-text-primary rounded-lg px-3 py-2 w-28"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                      accessibilityLabel={t('offlineFood.amount', {
                        defaultValue: 'Amount',
                      })}
                    />
                    <Text className="text-text-secondary text-base">
                      {variant.serving_unit}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {snapshot.mealTypes.map((type) => (
                      <Pressable
                        key={type.id}
                        onPress={() => setMealType(type.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: mealType === type.id }}
                        className={`px-3 py-1.5 rounded-full border ${
                          mealType === type.id
                            ? 'bg-accent-primary border-accent-primary'
                            : 'border-border-subtle'
                        }`}
                      >
                        <Text
                          className={
                            mealType === type.id
                              ? 'text-white text-sm'
                              : 'text-text-primary text-sm'
                          }
                        >
                          {getMealTypeLabel(type.name)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button onPress={handleAdd} disabled={!canAdd}>
                    {t('offlineFood.add', { defaultValue: 'Log offline' })}
                  </Button>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
};

export default OfflineFoodQuickAdd;
