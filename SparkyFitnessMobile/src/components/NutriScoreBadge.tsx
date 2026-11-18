import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NutriscoreGrade } from '@workspace/shared';

// Official Nutri-Score letter colours, dark green (A) to dark orange (E).
const GRADE_COLORS: Record<
  NutriscoreGrade,
  { background: string; foreground: string }
> = {
  a: { background: '#038141', foreground: '#FFFFFF' },
  b: { background: '#85BB2F', foreground: '#FFFFFF' },
  c: { background: '#FECB02', foreground: '#000000' },
  d: { background: '#EE8100', foreground: '#FFFFFF' },
  e: { background: '#E63E11', foreground: '#FFFFFF' },
};

interface NutriScoreBadgeProps {
  grade: NutriscoreGrade;
  style?: StyleProp<ViewStyle>;
}

const NutriScoreBadge: React.FC<NutriScoreBadgeProps> = ({ grade, style }) => {
  const { t } = useTranslation();
  const letter = grade.toUpperCase();
  const colors = GRADE_COLORS[grade];
  return (
    <View
      testID="nutriscore-badge"
      accessibilityRole="image"
      accessibilityLabel={t('foodSearch.accessibility.nutriScore', {
        grade: letter,
        defaultValue: 'Nutri-Score {{grade}}',
      })}
      style={[
        {
          backgroundColor: colors.background,
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 1,
        },
        style,
      ]}
    >
      <Text
        style={{ color: colors.foreground, fontSize: 11, fontWeight: '700' }}
      >
        {letter}
      </Text>
    </View>
  );
};

export default NutriScoreBadge;
