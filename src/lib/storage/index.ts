import type { IStorageProvider } from './interfaces';
import { R2StorageProvider } from './r2';

export function getStorageProvider(): IStorageProvider {
  return new R2StorageProvider();
}

export type * from './types';
export type * from './interfaces';
