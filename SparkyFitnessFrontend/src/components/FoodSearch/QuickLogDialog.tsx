import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle, Search } from 'lucide-react';
import type {
  QuickLogCandidate,
  QuickLogItem,
  QuickLogMatchItem,
} from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { VoiceInputControl } from '@/components/ai/VoiceInputControl';
import { useVoiceInput } from '@/hooks/AI/useVoiceInput';
import { useUserAIPreferences } from '@/hooks/AI/useAIServiceSettings';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import {
  useMatchQuickLogMutation,
  useSubmitQuickLogMutation,
} from '@/hooks/Foods/useQuickLog';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { usePreferences } from '@/contexts/PreferencesContext';

interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Meal type name as the diary uses it ("breakfast"). */
  mealType: string;
  /** YYYY-MM-DD */
  date: string;
}

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

const SOURCE_LABELS: Record<QuickLogCandidate['source'], string> = {
  library: 'My foods',
  intake24: 'Intake24',
  cofid: 'CoFID',
};

const QuickLogDialog = ({
  open,
  onOpenChange,
  mealType,
  date,
}: QuickLogDialogProps) => {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [items, setItems] = useState<QuickLogMatchItem[]>([]);
  const [choices, setChoices] = useState<RowChoice[]>([]);
  const match = useMatchQuickLogMutation();
  const submit = useSubmitQuickLogMutation();
  const { data: mealTypes } = useMealTypes();
  const { openChat } = useChatbotVisibility();
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const { data: preferences } = useUserAIPreferences();
  const waveformRef = useRef<HTMLDivElement>(null);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  const voiceEnabled =
    !!preferences && preferences.voice_input_enabled !== false;
  const voice = useVoiceInput({
    enabled: open && voiceEnabled,
    serviceId: preferences?.active_voice_ai_service_id ?? null,
    language: i18n.language,
    getText: () => textRef.current,
    setText,
    onLevel: (level) =>
      waveformRef.current?.style.setProperty('--voice-level', String(level)),
  });

  const mealTypeId = useMemo(
    () =>
      mealTypes?.find(
        (type) => type.name.toLowerCase() === mealType.toLowerCase()
      )?.id,
    [mealTypes, mealType]
  );

  const reset = () => {
    setText('');
    setItems([]);
    setChoices([]);
  };

  const handleFind = async () => {
    const result = await match.mutateAsync(text);
    setItems(result.items);
    setChoices(result.items.map(initialChoice));
  };

  const updateChoice = (index: number, patch: Partial<RowChoice>) =>
    setChoices((current) =>
      current.map((choice, i) =>
        i === index ? { ...choice, ...patch } : choice
      )
    );

  const selected = items.flatMap((item, index) => {
    const choice = choices[index];
    const candidate = choice ? candidatesOf(item)[choice.candidate] : undefined;
    const variant = candidate?.variants[choice?.variant ?? 0];
    const quantity = Number(choice?.quantity);
    if (!choice?.include || !candidate || !variant || !(quantity > 0)) {
      return [];
    }
    return [{ candidate, variant, quantity }];
  });

  const unmatched = items
    .filter((_, index) => !choices[index]?.include)
    .map((item) => item.phrase.raw);

  const handleLog = async () => {
    if (!mealTypeId || selected.length === 0) return;
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
    await submit.mutateAsync({
      entry_date: date,
      meal_type_id: mealTypeId,
      items: body,
    });
    toast({
      title: t('quickLog.logged', 'Logged {{count}} foods', {
        count: selected.length,
      }),
    });
    reset();
    onOpenChange(false);
  };

  const handleAskSparky = () => {
    const leftover = unmatched.length > 0 ? unmatched.join(', ') : text;
    openChat(
      t('quickLog.askSparkyDraft', 'Log for {{meal}} on {{date}}: {{food}}', {
        meal: mealType,
        date,
        food: leftover,
      })
    );
    onOpenChange(false);
  };

  const totalCalories = selected.reduce(
    (sum, { variant, quantity }) =>
      sum + (variant.calories * quantity) / (variant.serving_size || 1),
    0
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) voice.cancel();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('quickLog.title', 'Log by voice or text')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'quickLog.description',
              'Say or type what you ate, for example "two eggs and a slice of toast". Check the matches, then log them all at once.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t(
              'quickLog.placeholder',
              'two eggs, a slice of toast and a cup of tea'
            )}
            aria-label={t('quickLog.textLabel', 'What did you eat?')}
            rows={3}
            maxLength={1000}
            disabled={voice.busy}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {voiceEnabled ? (
              <VoiceInputControl {...voice} waveformRef={waveformRef}>
                <Button
                  onClick={handleFind}
                  disabled={!text.trim() || match.isPending || voice.busy}
                >
                  {match.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  {t('quickLog.find', 'Find foods')}
                </Button>
              </VoiceInputControl>
            ) : (
              <Button
                onClick={handleFind}
                disabled={!text.trim() || match.isPending}
              >
                <Search className="mr-2 h-4 w-4" />
                {t('quickLog.find', 'Find foods')}
              </Button>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <ul className="divide-y rounded-md border">
            {items.map((item, index) => {
              const choice = choices[index] ?? initialChoice(item);
              const candidates = candidatesOf(item);
              const candidate = candidates[choice.candidate];
              return (
                <li
                  key={`${item.phrase.raw}-${index}`}
                  className="space-y-2 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`quick-log-${index}`}
                      checked={choice.include}
                      disabled={!candidate}
                      onCheckedChange={(checked) =>
                        updateChoice(index, { include: checked === true })
                      }
                    />
                    <label
                      htmlFor={`quick-log-${index}`}
                      className="text-sm font-medium"
                    >
                      {item.phrase.raw}
                    </label>
                  </div>
                  {candidate ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        aria-label={t('quickLog.food', 'Food')}
                        value={choice.candidate}
                        onChange={(event) => {
                          const next = candidates[Number(event.target.value)];
                          updateChoice(index, {
                            candidate: Number(event.target.value),
                            variant: next?.variant_index ?? 0,
                            quantity: next ? String(next.quantity) : '',
                          });
                        }}
                      >
                        {candidates.map((option, optionIndex) => (
                          <option key={optionIndex} value={optionIndex}>
                            {option.name} ·{' '}
                            {t(
                              `quickLog.source.${option.source}`,
                              SOURCE_LABELS[option.source]
                            )}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        aria-label={t('quickLog.portion', 'Portion')}
                        value={choice.variant}
                        onChange={(event) =>
                          updateChoice(index, {
                            variant: Number(event.target.value),
                          })
                        }
                      >
                        {candidate.variants.map((variant, variantIndex) => (
                          <option key={variantIndex} value={variantIndex}>
                            {variant.serving_size === 1
                              ? variant.serving_unit
                              : `${variant.serving_size} ${variant.serving_unit}`}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={choice.quantity}
                        onChange={(event) =>
                          updateChoice(index, { quantity: event.target.value })
                        }
                        inputMode="decimal"
                        aria-label={t('quickLog.quantity', 'Quantity')}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'quickLog.noMatch',
                        'No match found. Ask Sparky, or search for it in Add Food.'
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={handleAskSparky}
            disabled={!text.trim()}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            {t('quickLog.askSparky', 'Ask Sparky instead')}
          </Button>
          <Button
            onClick={handleLog}
            disabled={selected.length === 0 || !mealTypeId || submit.isPending}
          >
            {submit.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('quickLog.log', 'Log {{count}} foods ({{energy}} {{unit}})', {
              count: selected.length,
              energy: Math.round(
                convertEnergy(totalCalories, 'kcal', energyUnit)
              ),
              unit: getEnergyUnitString(energyUnit),
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickLogDialog;
