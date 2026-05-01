import { describe, expect, it } from 'vitest';
import {
  WIZARD_STEPS,
  nextStep,
  pathForStep,
  previousStep,
  stepFromPath,
} from '@/components/wizard/steps';
import { isPriorStepValid } from '@/components/wizard/wizard-context';

describe('wizard step navigation', () => {
  it('exposes the three canonical steps in order', () => {
    expect(WIZARD_STEPS).toEqual(['general', 'buildings', 'units']);
  });

  it('maps each step to its route', () => {
    expect(pathForStep('general')).toBe('/properties/new');
    expect(pathForStep('buildings')).toBe('/properties/new/buildings');
    expect(pathForStep('units')).toBe('/properties/new/units');
  });

  it('parses the active step from a pathname', () => {
    expect(stepFromPath('/properties/new')).toBe('general');
    expect(stepFromPath('/properties/new/buildings')).toBe('buildings');
    expect(stepFromPath('/properties/new/units')).toBe('units');
  });

  it('falls back to general for unrelated paths', () => {
    expect(stepFromPath('/dashboard')).toBe('general');
    expect(stepFromPath('/properties/new/somewhere-else')).toBe('general');
  });

  it('walks previous/next correctly', () => {
    expect(previousStep('general')).toBeNull();
    expect(previousStep('buildings')).toBe('general');
    expect(previousStep('units')).toBe('buildings');
    expect(nextStep('general')).toBe('buildings');
    expect(nextStep('buildings')).toBe('units');
    expect(nextStep('units')).toBeNull();
  });
});

describe('isPriorStepValid', () => {
  const allInvalid = { general: false, buildings: false, units: false };
  const generalOnly = { general: true, buildings: false, units: false };
  const generalAndBuildings = { general: true, buildings: true, units: false };

  it('always permits step 1', () => {
    expect(isPriorStepValid(allInvalid, 'general')).toBe(true);
  });

  it('blocks step 2 when step 1 is invalid', () => {
    expect(isPriorStepValid(allInvalid, 'buildings')).toBe(false);
  });

  it('admits step 2 when step 1 is valid', () => {
    expect(isPriorStepValid(generalOnly, 'buildings')).toBe(true);
  });

  it('blocks step 3 unless steps 1 + 2 are both valid', () => {
    expect(isPriorStepValid(generalOnly, 'units')).toBe(false);
    expect(isPriorStepValid(generalAndBuildings, 'units')).toBe(true);
  });
});
