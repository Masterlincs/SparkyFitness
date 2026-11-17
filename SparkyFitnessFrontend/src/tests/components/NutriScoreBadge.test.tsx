import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NutriScoreBadge from '@/components/FoodSearch/NutriScoreBadge';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: { grade?: string }) =>
      fallback.replace('{{grade}}', options?.grade ?? ''),
  }),
}));

describe('NutriScoreBadge', () => {
  it('shows the upper-case grade with an accessible name', () => {
    render(<NutriScoreBadge grade="b" />);

    const badge = screen.getByRole('img', { name: 'Nutri-Score B' });
    expect(badge).toHaveTextContent('NutriB');
    expect(badge.className).toContain('bg-[#85BB2F]');
  });

  it('uses the dark text colour on the yellow C grade', () => {
    render(<NutriScoreBadge grade="c" />);

    expect(screen.getByTestId('nutriscore-badge').className).toContain(
      'text-black'
    );
  });
});
