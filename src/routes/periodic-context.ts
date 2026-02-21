import type { PeriodicNotePeriod } from '@obsidian-workspace/shared-types';
import { parseEnumParam } from '../utils/request-parsers';

const VALID_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

interface PeriodicRequestParts {
  period?: PeriodicNotePeriod;
  year?: number;
  month?: number;
  day?: number;
}

export function parsePeriodicRequest(
  params: Record<string, string | undefined>,
): PeriodicRequestParts {
  return {
    period: parseEnumParam(params.period, VALID_PERIODS),
    year: params.year ? parseInt(params.year, 10) : undefined,
    month: params.month ? parseInt(params.month, 10) : undefined,
    day: params.day ? parseInt(params.day, 10) : undefined,
  };
}
