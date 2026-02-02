import type { ProcessDataOptions } from "../types/functionUtils";

export function processData<T>(
  data: T[],
  options: ProcessDataOptions<T> = {},
): T[] {
  let result = [...data];

  if (options.filter) {
    result = result.filter(options.filter);
  }

  if (options.sort) {
    result.sort(options.sort);
  }

  if (options.skip) {
    result = result.slice(options.skip);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }

  return result;
}
