import { useTranslation } from 'react-i18next';
import type { NutriscoreGrade } from '@workspace/shared';
import { cn } from '@/lib/utils';

// Official Nutri-Score letter colours, dark green (A) to dark orange (E).
const GRADE_CLASSES: Record<NutriscoreGrade, string> = {
  a: 'bg-[#038141] text-white',
  b: 'bg-[#85BB2F] text-white',
  c: 'bg-[#FECB02] text-black',
  d: 'bg-[#EE8100] text-white',
  e: 'bg-[#E63E11] text-white',
};

interface NutriScoreBadgeProps {
  grade: NutriscoreGrade;
  className?: string;
}

const NutriScoreBadge = ({ grade, className = '' }: NutriScoreBadgeProps) => {
  const { t } = useTranslation();
  const letter = grade.toUpperCase();
  return (
    <span
      role="img"
      aria-label={t('foods.nutriScore', 'Nutri-Score {{grade}}', {
        grade: letter,
      })}
      title={t('foods.nutriScore', 'Nutri-Score {{grade}}', { grade: letter })}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-bold leading-none',
        GRADE_CLASSES[grade],
        className
      )}
      data-testid="nutriscore-badge"
    >
      <span className="font-medium opacity-90">
        {t('foods.nutriScoreShort', 'Nutri')}
      </span>
      {letter}
    </span>
  );
};

export default NutriScoreBadge;
