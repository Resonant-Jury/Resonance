import type { IStorageProvider } from './interfaces';
import { MockStorageProvider } from './mock';
import { R2StorageProvider } from './r2';

export function getStorageProvider(): IStorageProvider {
  if (process.env.STORAGE_PROVIDER === 'r2') return new R2StorageProvider();
  return new MockStorageProvider();
}

export type * from './types';
export type * from './interfaces';
