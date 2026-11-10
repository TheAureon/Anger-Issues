import { handTools } from './hand.js';
import { bluntTools } from './blunt.js';
import { bladeTools } from './blades.js';
import { rangedTools } from './ranged.js';
import { explosiveTools } from './explosives.js';
import { machineTools } from './machines.js';
import { chaosTools } from './chaos.js';
import { trapTools } from './traps.js';
import { heavyTools, powerBladeTools, gunTools, bigBoomTools, scienceTools } from './arsenal.js';

export const CATEGORIES = [
  { id: 'hand', name: 'Hands', icon: '✋' },
  { id: 'blunt', name: 'Blunt', icon: '🔨' },
  { id: 'blades', name: 'Blades', icon: '🗡️' },
  { id: 'ranged', name: 'Ranged', icon: '🎯' },
  { id: 'explosives', name: 'Explosives', icon: '💣' },
  { id: 'machines', name: 'Machines', icon: '⚙️' },
  { id: 'traps', name: 'Traps', icon: '🪤' },
  { id: 'chaos', name: 'Chaos', icon: '🌀' },
];

export function createTools(game) {
  return [
    ...handTools(game),
    ...bluntTools(game),
    ...heavyTools(game),
    ...bladeTools(game),
    ...powerBladeTools(game),
    ...rangedTools(game),
    ...gunTools(game),
    ...explosiveTools(game),
    ...bigBoomTools(game),
    ...machineTools(game),
    ...trapTools(game),
    ...chaosTools(game),
    ...scienceTools(game),
  ];
}
