import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import {
  useAiMealPlanMutation,
  useGenerateMealPlanMutation,
} from '@/hooks/Foods/useMealPlanBuilder';

interface GenerateMealPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = 'meals' | 'ai';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const GenerateMealPlanDialog = ({
  open,
  onOpenChange,
}: GenerateMealPlanDialogProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('meals');
  const [startDate, setStartDate] = useState(() =>
    formatDateToYYYYMMDD(new Date())
  );
  const [calories, setCalories] = useState('');
  const [preferences, setPreferences] = useState('');
  const generate = useGenerateMealPlanMutation();
  const ai = useAiMealPlanMutation();
  const pending = generate.isPending || ai.isPending;

  const handleSubmit = async () => {
    const target = Number(calories);
    const calorie_target =
      calories.trim() && target >= 800 && target <= 6000 ? target : undefined;
    try {
      const result =
        mode === 'meals'
          ? await generate.mutateAsync({
              start_date: startDate,
              calorie_target,
            })
          : await ai.mutateAsync({
              start_date: startDate,
              calorie_target,
              preferences: preferences.trim() || undefined,
            });
      toast({
        title: t(
          'mealPlanBuilder.planCreated',
          'Meal plan "{{name}}" created',
          {
            name: result.plan_name,
          }
        ),
        description: t(
          'mealPlanBuilder.planCreatedDetail',
          'About {{calories}} kcal a day. It is switched off: review it in Meal Plans, then turn it on.',
          { calories: result.daily_target }
        ),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t('mealPlanBuilder.planFailed', 'Could not create the plan'),
        description: errorText(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('mealPlanBuilder.generateTitle', 'Generate a meal plan')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'mealPlanBuilder.generateDescription',
              'Builds a week of breakfasts, lunches, dinners and snacks around your calorie target. Nothing is logged until you turn the plan on.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(['meals', 'ai'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                variant={mode === option ? 'default' : 'outline'}
                onClick={() => setMode(option)}
              >
                {option === 'meals'
                  ? t('mealPlanBuilder.fromMyMeals', 'From my saved meals')
                  : t('mealPlanBuilder.aiWritten', 'AI-written recipes')}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === 'meals'
              ? t(
                  'mealPlanBuilder.fromMyMealsHint',
                  'Uses your saved meals, including imported starter recipes and Mealie recipes.'
                )
              : t(
                  'mealPlanBuilder.aiHint',
                  'Your AI service writes about 13 recipes, which are saved as meals with ingredients matched to UK foods. AI recipes are not reviewed by a dietitian. This uses your AI provider and can take a few minutes.'
                )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="plan-start">
                {t('mealPlanBuilder.startDate', 'Start date')}
              </Label>
              <Input
                id="plan-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-calories">
                {t('mealPlanBuilder.dailyCalories', 'kcal a day (optional)')}
              </Label>
              <Input
                id="plan-calories"
                inputMode="numeric"
                value={calories}
                onChange={(event) => setCalories(event.target.value)}
                placeholder={t('mealPlanBuilder.yourGoal', 'Your goal')}
              />
            </div>
          </div>
          {mode === 'ai' && (
            <div className="space-y-1">
              <Label htmlFor="plan-preferences">
                {t('mealPlanBuilder.preferences', 'Preferences and allergies')}
              </Label>
              <Textarea
                id="plan-preferences"
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t(
                  'mealPlanBuilder.preferencesPlaceholder',
                  'vegetarian, no mushrooms, quick weekday dinners'
                )}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending || !startDate}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('mealPlanBuilder.generate', 'Generate plan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateMealPlanDialog;
