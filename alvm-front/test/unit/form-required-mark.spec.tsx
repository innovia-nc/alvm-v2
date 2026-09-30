// @vitest-environment jsdom
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

function Harness({ required }: { required?: boolean }) {
  const form = useForm({ defaultValues: { name: '' } });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={() => (
          <FormItem>
            <FormLabel required={required}>Nom</FormLabel>
          </FormItem>
        )}
      />
    </Form>
  );
}

describe('FormLabel required', () => {
  it('affiche un astérisque masqué aux lecteurs d’écran', () => {
    render(<Harness required />);
    const star = screen.getByText('*');
    expect(star.getAttribute('aria-hidden')).toBe('true');
  });
  it('n’affiche rien pour un champ optionnel', () => {
    render(<Harness />);
    expect(screen.queryByText('*')).toBeNull();
  });
});
