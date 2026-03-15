type ProcessDataOptions<T> = {
  filter?: (item: T) => boolean;
  sort?: (a: T, b: T) => number;
  skip?: number;
  limit?: number;
};

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
