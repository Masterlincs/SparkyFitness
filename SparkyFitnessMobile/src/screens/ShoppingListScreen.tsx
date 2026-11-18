import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { ShoppingListItemResponse } from '@workspace/shared';

import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import ServerGate from '../components/ServerGate';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useShoppingList,
  useShoppingListMutations,
} from '../hooks/useShoppingList';
import { formatLocalizedNumber } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ShoppingList'>;

/** "250 g Beef mince", "12 Eggs", or just the name. */
const itemLabel = (item: ShoppingListItemResponse): string => {
  if (item.quantity === null) return item.name;
  const amount = formatLocalizedNumber(item.quantity, {
    maximumFractionDigits: 1,
  });
  return `${amount}${item.unit ? ` ${item.unit}` : ''} ${item.name}`;
};

const ShoppingListScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [name, setName] = useState('');
  const { items, isLoading, isError, refetch } = useShoppingList();
  const { addMutation, toggleMutation, deleteMutation, clearCheckedMutation } =
    useShoppingListMutations();
  const checkedCount = items.filter((item) => item.checked).length;

  const header = useScreenHeader({
    title: t('shoppingList.title', { defaultValue: 'Shopping list' }),
    left: { kind: 'back' },
    right:
      checkedCount > 0
        ? [
            {
              kind: 'text',
              label: t('shoppingList.clearTicked', {
                defaultValue: 'Clear ticked',
              }),
              onPress: () => clearCheckedMutation.mutate(),
              disabled: clearCheckedMutation.isPending,
            },
          ]
        : [],
  });

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addMutation.mutate({ name: trimmed }, { onSuccess: () => setName('') });
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ServerGate>
        <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
          <TextInput
            className="flex-1 bg-surface text-text-primary rounded-lg px-3 py-2.5"
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
            maxLength={200}
            placeholder={t('shoppingList.addPlaceholder', {
              defaultValue: 'Add an item',
            })}
            accessibilityLabel={t('shoppingList.addPlaceholder', {
              defaultValue: 'Add an item',
            })}
          />
          <Button
            onPress={handleAdd}
            disabled={!name.trim() || addMutation.isPending}
          >
            {t('shoppingList.add', { defaultValue: 'Add' })}
          </Button>
        </View>
        {isError ? (
          <StatusView
            icon="alert-circle"
            iconTone="danger"
            title={t('shoppingList.loadFailed', {
              defaultValue: 'Could not load the shopping list.',
            })}
            action={{
              label: t('common.retry', { defaultValue: 'Retry' }),
              onPress: () => void refetch(),
            }}
          />
        ) : isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : items.length === 0 ? (
          <StatusView
            icon="list"
            title={t('shoppingList.empty', {
              defaultValue: 'Nothing to buy yet',
            })}
            subtitle={t('shoppingList.emptyHint', {
              defaultValue:
                'Add items here, or add a meal plan to your list from the web app.',
            })}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 24 + activeWorkoutBarPadding,
            }}
            renderItem={({ item }) => (
              <View className="flex-row items-center py-3 border-b border-border-subtle">
                <Pressable
                  className="flex-1 flex-row items-center gap-3"
                  onPress={() =>
                    toggleMutation.mutate({
                      id: item.id,
                      checked: !item.checked,
                    })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  accessibilityLabel={itemLabel(item)}
                >
                  <Icon
                    name={
                      item.checked
                        ? 'checkmark-circle-filled'
                        : 'radio-button-off'
                    }
                    size={22}
                    color={item.checked ? accentColor : textMuted}
                  />
                  <Text
                    className={`text-base flex-1 ${
                      item.checked
                        ? 'text-text-muted line-through'
                        : 'text-text-primary'
                    }`}
                  >
                    {itemLabel(item)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteMutation.mutate(item.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('shoppingList.remove', {
                    name: item.name,
                    defaultValue: 'Remove {{name}}',
                  })}
                >
                  <Icon name="trash" size={18} color={textMuted} />
                </Pressable>
              </View>
            )}
          />
        )}
      </ServerGate>
    </View>
  );
};

export default ShoppingListScreen;
