// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chooseOption, installRadixDomPolyfills } from '../../../test/radix-dom';
import { SelectField } from './select-field';

beforeAll(installRadixDomPolyfills);
afterEach(cleanup);

const OPTIONS = [
  { value: 'p1', label: 'Rita' },
  { value: 'p2', label: 'Rui' },
];

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <form data-testid="form">
      <SelectField
        id="assignee"
        name="assignee"
        label="Responsável"
        value={value}
        onValueChange={setValue}
        options={OPTIONS}
        emptyLabel="Sem responsável"
      />
    </form>
  );
}

function submitted(): FormDataEntryValue | null {
  return new FormData(screen.getByTestId('form') as HTMLFormElement).get('assignee');
}

function nativeSubmitted(value: string): FormDataEntryValue | null {
  const { container } = render(
    <form>
      <select name="assignee" defaultValue={value}>
        <option value="">Sem responsável</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>,
  );
  return new FormData(container.querySelector('form') as HTMLFormElement).get('assignee');
}

describe('SelectField', () => {
  it('submits the same form data as a native select', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await chooseOption(user, 'Responsável', 'Rui');

    expect(submitted()).toBe('p2');
    expect(submitted()).toBe(nativeSubmitted('p2'));
  });

  it('submits an empty string for the empty option, as a native select does', async () => {
    const user = userEvent.setup();
    render(<Harness initial="p1" />);

    expect(submitted()).toBe('p1');
    await chooseOption(user, 'Responsável', 'Sem responsável');

    expect(submitted()).toBe('');
    expect(submitted()).toBe(nativeSubmitted(''));
  });

  it('submits exactly one entry for the field', () => {
    render(<Harness initial="p1" />);

    const form = screen.getByTestId('form') as HTMLFormElement;
    expect(new FormData(form).getAll('assignee')).toEqual(['p1']);
  });
});
