import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { BuiltMealSummary } from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useImportStarterRecipeMutation,
  useStarterRecipes,
} from '@/hooks/Foods/useMealPlanBuilder';

interface StarterRecipesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StarterRecipesDialog = ({
  open,
  onOpenChange,
}: StarterRecipesDialogProps) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, BuiltMealSummary>>(
    {}
  );
  const { data: recipes = [], isLoading } = useStarterRecipes(open);
  const importRecipe = useImportStarterRecipeMutation();

  const shown = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term
      ? recipes.filter((recipe) => recipe.name.toLowerCase().includes(term))
      : recipes;
  }, [recipes, filter]);

  const handleImport = async (title: string) => {
    setImporting(title);
    try {
      const meal = await importRecipe.mutateAsync(title);
      setImported((current) => ({ ...current, [title]: meal }));
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('mealPlanBuilder.starterTitle', 'Starter recipes')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'mealPlanBuilder.starterDescription',
              'British and Irish recipes from the Wikibooks Cookbook (CC BY-SA 4.0). Importing one saves it as a meal, with its ingredients matched to UK foods. Check the result: home recipes are community-written, not dietitian-written.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('mealPlanBuilder.filterRecipes', 'Filter recipes')}
          aria-label={t('mealPlanBuilder.filterRecipes', 'Filter recipes')}
        />
        {isLoading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        ) : (
          <ul className="divide-y rounded-md border">
            {shown.map((recipe) => {
              const done = imported[recipe.title];
              return (
                <li key={recipe.title} className="space-y-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={recipe.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm hover:underline"
                    >
                      {recipe.name}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      size="sm"
                      variant={done ? 'secondary' : 'default'}
                      disabled={!!done || importing !== null}
                      onClick={() => handleImport(recipe.title)}
                    >
                      {importing === recipe.title && (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      )}
                      {done
                        ? t('mealPlanBuilder.imported', 'Imported')
                        : t('mealPlanBuilder.import', 'Import')}
                    </Button>
                  </div>
                  {done && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'mealPlanBuilder.importedDetail',
                        '{{matched}} ingredients matched, about {{calories}} kcal a serving.',
                        {
                          matched: done.ingredients.length,
                          calories: done.calories_per_serving,
                        }
                      )}
                      {done.unmatched.length > 0 &&
                        ` ${t(
                          'mealPlanBuilder.leftOut',
                          'Left out: {{lines}}',
                          {
                            lines: done.unmatched.join('; '),
                          }
                        )}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StarterRecipesDialog;
