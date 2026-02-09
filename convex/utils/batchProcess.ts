import { ProcessDataOptions } from "../types/types";

export async function batchProcess<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
  delayMs = 50,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    await Promise.all(batch.map(processor));

    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function batchProcessWithoutDelay<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    await Promise.all(batch.map(processor));
  }
}

export async function batchProcessWithResults<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayMs = 50,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`,
    );

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

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
