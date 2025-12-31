import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

type Locator =
  | { role: Parameters<typeof screen.getByRole>[0]; name: string | RegExp }
  | { text: string | RegExp };

export type StoryStep =
  | { kind: 'click'; target: Locator }
  | { kind: 'type'; target: Locator; text: string }
  | { kind: 'expectText'; text: string | RegExp }
  | { kind: 'expectNotText'; text: string | RegExp };

function getEl(target: Locator): HTMLElement {
  if ('role' in target) {
    return screen.getByRole(target.role, { name: target.name });
  }
  return screen.getByText(target.text);
}

export async function runStorySteps(user: UserEvent, steps: StoryStep[]) {
  for (const step of steps) {
    if (step.kind === 'click') {
      await user.click(getEl(step.target));
      continue;
    }
    if (step.kind === 'type') {
      await user.type(getEl(step.target), step.text);
      continue;
    }
    if (step.kind === 'expectText') {
      expect(screen.getByText(step.text)).toBeTruthy();
      continue;
    }
    if (step.kind === 'expectNotText') {
      expect(screen.queryByText(step.text)).toBeNull();
      continue;
    }
    // Exhaustiveness check - TypeScript should catch all step kinds at compile time
    // @ts-expect-error - This should never happen if all step kinds are handled above
    throw new Error(`Unknown step kind: ${step.kind}`);
  }
}


