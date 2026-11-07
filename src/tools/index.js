import { handTools } from './hand.js';
import { bluntTools } from './blunt.js';
import { bladeTools } from './blades.js';
import { rangedTools } from './ranged.js';
import { explosiveTools } from './explosives.js';
import { machineTools } from './machines.js';
import { chaosTools } from './chaos.js';

export const CATEGORIES = [
  { id: 'hand', name: 'Hands', icon: '✋' },
  { id: 'blunt', name: 'Blunt', icon: '🔨' },
  { id: 'blades', name: 'Blades', icon: '🗡️' },
  { id: 'ranged', name: 'Ranged', icon: '🎯' },
  { id: 'explosives', name: 'Explosives', icon: '💣' },
  { id: 'machines', name: 'Machines', icon: '⚙️' },
  { id: 'chaos', name: 'Chaos', icon: '🌀' },
];

export function createTools(game) {
  return [
    ...handTools(game),
    ...bluntTools(game),
    ...bladeTools(game),
    ...rangedTools(game),
    ...explosiveTools(game),
    ...machineTools(game),
    ...chaosTools(game),
  ];
}
