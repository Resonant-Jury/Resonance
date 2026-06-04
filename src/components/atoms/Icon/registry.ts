import { BellIcon } from './icons/bell';
import { StarIcon } from './icons/star';
import { SparkleIcon } from './icons/sparkle';
import { CloseIcon } from './icons/close';
import { PlusIcon } from './icons/plus';
import { CheckIcon } from './icons/check';
import { ArrowRightIcon } from './icons/arrow-right';
import { ChevronDownIcon } from './icons/chevron-down';
import { ImageIcon } from './icons/image';
import { EyeIcon } from './icons/eye';
import { LockIcon } from './icons/lock';
import { UsersIcon } from './icons/users';
import { GlobeIcon } from './icons/globe';
import { WaveIcon } from './icons/wave';
import { PenIcon } from './icons/pen';
import { CardsIcon } from './icons/cards';
import { CommentIcon } from './icons/comment';
import { LogoutIcon } from './icons/logout';
import type { IconRenderer } from './types';

/**
 * Central icon registry. Add a new icon by:
 *  1) Creating `./icons/<name>.tsx` that exports a renderer using IconRenderProps.
 *  2) Importing and adding it to the map below.
 *  3) Adding the string literal to `IconName` so consumers get type safety.
 *
 * Why a registry (vs. importing each component directly):
 *  - Single source of truth — easy to audit, easy to swap implementations.
 *  - Consumers spell icon names as strings, which makes prop drilling
 *    (e.g. <FloatingButton icon="plus" />) trivial without forcing every
 *    parent to import the underlying component.
 *  - All icons share the same prop contract (size / color / strokeWidth),
 *    which keeps the hand-drawn style consistent across the app.
 */
export const ICONS = {
  bell: BellIcon,
  star: StarIcon,
  sparkle: SparkleIcon,
  close: CloseIcon,
  plus: PlusIcon,
  check: CheckIcon,
  'arrow-right': ArrowRightIcon,
  'chevron-down': ChevronDownIcon,
  image: ImageIcon,
  eye: EyeIcon,
  lock: LockIcon,
  users: UsersIcon,
  globe: GlobeIcon,
  wave: WaveIcon,
  pen: PenIcon,
  cards: CardsIcon,
  comment: CommentIcon,
  logout: LogoutIcon,
} satisfies Record<string, IconRenderer>;

export type IconName = keyof typeof ICONS;
