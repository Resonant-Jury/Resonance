import type { Scene } from '../scene';
import { intro } from './intro';
import { write } from './write';
import { visibility } from './visibility';
import { resonate } from './resonate';
import { notes } from './notes';
import { map } from './map';
import { outro } from './outro';

/** In stage order: a later scene draws over an earlier one while they overlap. */
export const SCENES: Scene[] = [intro, write, visibility, resonate, notes, map, outro];
