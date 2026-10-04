import { BoxItem, DragonSection, isBoxFrozen } from '../types/level';
import { checkExitPath } from './collision';

export interface SolverStep {
  step: number;
  boxId: number;
  boxColor: number;
  boxCapacity: number;
  unblockedBoxes: number[];
}

export interface SolveResult {
  success: boolean;
  solutionOrder: BoxItem[];
  error?: string;
  unsolvableRemaining?: BoxItem[];
}

export type DragonDifficulty = 'easy' | 'normal' | 'hard';

/**
 * Finds a valid topological extraction order of all boxes on the board.
 * Simulates clearing boxes that currently have an unobstructed exit path,
 * and accounts for launching unfrozen buses to shatter frozen (Ice) buses.
 */
export function solveBoxLayout(boxes: BoxItem[]): SolveResult {
  // Deep copy so we can simulate unfreezing without mutating original array
  const remaining = boxes.map((b) => ({ ...b }));
  const solutionOrder: BoxItem[] = [];

  const maxSteps = boxes.length * 3 + 10;
  let steps = 0;

  while (remaining.length > 0 && steps++ < maxSteps) {
    // 1. Find all unfrozen boxes that currently have a clear path
    const freeBoxes = remaining.filter(
      (b) => !isBoxFrozen(b) && !checkExitPath(b, remaining).isBlocked
    );

    if (freeBoxes.length > 0) {
      // Prioritize boxes that unblock the most other boxes
      let bestBox = freeBoxes[0];
      let maxUnblocked = -1;

      for (const candidate of freeBoxes) {
        const simulatedRemaining = remaining.filter((b) => b.id !== candidate.id);
        const newlyFreeCount = simulatedRemaining.filter(
          (b) => !isBoxFrozen(b) && !checkExitPath(b, simulatedRemaining).isBlocked
        ).length;

        if (newlyFreeCount > maxUnblocked) {
          maxUnblocked = newlyFreeCount;
          bestBox = candidate;
        }
      }

      solutionOrder.push(boxes.find((b) => b.id === bestBox.id) || bestBox);
      const idx = remaining.findIndex((b) => b.id === bestBox.id);
      remaining.splice(idx, 1);
      continue;
    }

    // 2. If no direct free boxes, check if any unfrozen box can hit an Ice box to unfreeze it!
    let unfrozenAny = false;
    for (const candidate of remaining) {
      if (isBoxFrozen(candidate)) continue;
      const hit = checkExitPath(candidate, remaining);
      if (hit.isBlocked && hit.blockingBoxId) {
        const target = remaining.find((b) => b.id === hit.blockingBoxId);
        if (target && isBoxFrozen(target)) {
          // Unfreeze target! Attacking box bounces back to its position.
          target.boxType = 'Normal';
          unfrozenAny = true;
          break; // proceed with new unfrozen box in next loop iteration
        }
      }
    }

    if (unfrozenAny) {
      continue;
    }

    // Deadlock: remaining boxes are mutually blocking each other
    return {
      success: false,
      solutionOrder,
      error: `Circular deadlock detected! ${remaining.length} boxes are stuck.`,
      unsolvableRemaining: remaining,
    };
  }

  return {
    success: remaining.length === 0,
    solutionOrder,
  };
}

function getValidChunkSizes(needed: number, maxAllowed: number): number[] {
  const max = Math.min(needed, maxAllowed);
  const valids: number[] = [];
  for (let c = 2; c <= max; c++) {
    const rem = needed - c;
    if (rem === 0 || rem >= 2) {
      valids.push(c);
    }
  }
  return valids;
}

/**
 * Sanitizes dragon wool sections to guarantee:
 * 1. Every continuous section has count in [2, 10]
 * 2. No adjacent sections have the same color (interleaves them)
 * 3. Exact sum of wool per color is preserved
 */
export function enforceDragonSegmentConstraints(sections: DragonSection[]): DragonSection[] {
  if (sections.length === 0) return [];

  // Step 1: Merge strictly adjacent identical colors if combined count <= 10
  const merged: DragonSection[] = [];
  for (const s of sections) {
    if (s.count <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && last.color === s.color && last.count + s.count <= 10) {
      last.count += s.count;
    } else {
      merged.push({ color: s.color, count: s.count });
    }
  }

  // Step 2: Split any section > 10 into chunks in [2, 10]
  const split: DragonSection[] = [];
  for (const s of merged) {
    if (s.count <= 10) {
      split.push(s);
    } else {
      let rem = s.count;
      while (rem > 10) {
        let chunk = Math.min(10, Math.ceil(rem / 2));
        if (rem - chunk === 1) chunk--;
        split.push({ color: s.color, count: chunk });
        rem -= chunk;
      }
      if (rem > 0) {
        split.push({ color: s.color, count: rem });
      }
    }
  }

  // Step 3: If any section has count < 2 (e.g. 1), adjust with another section of same color
  for (let i = 0; i < split.length; i++) {
    if (split[i].count < 2) {
      const donor = split.find((s, idx) => idx !== i && s.color === split[i].color && s.count >= 3);
      if (donor) {
        donor.count -= 1;
        split[i].count += 1;
      } else {
        const adj = split.findIndex((s, idx) => idx !== i && s.color === split[i].color);
        if (adj !== -1 && split[adj].count + split[i].count <= 10) {
          split[adj].count += split[i].count;
          split.splice(i, 1);
          i--;
          continue;
        }
      }
    }
  }

  // Step 4: Interleave adjacent identical colors
  const result = [...split];
  let changed = true;
  let iterations = 0;
  while (changed && iterations++ < 50) {
    changed = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i].color === result[i + 1].color) {
        // If combined <= 10, merge
        if (result[i].count + result[i + 1].count <= 10) {
          result[i].count += result[i + 1].count;
          result.splice(i + 1, 1);
          changed = true;
          break;
        }
        // Otherwise search for a different color section to insert between
        let swapIdx = -1;
        for (let j = i + 2; j < result.length; j++) {
          if (result[j].color !== result[i].color) {
            swapIdx = j;
            break;
          }
        }
        if (swapIdx === -1) {
          for (let j = i - 1; j >= 0; j--) {
            if (result[j].color !== result[i].color) {
              swapIdx = j;
              break;
            }
          }
        }
        if (swapIdx !== -1) {
          const [diffSec] = result.splice(swapIdx, 1);
          result.splice(i + 1, 0, diffSec);
          changed = true;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Auto-generates a sequence of dragon wool sections guaranteed to be solvable
 * with the given box layout, optional tunnel/conveyor boxes, and available slot capacity.
 */
export function autoGenerateDragonSections(
  boxes: BoxItem[],
  slotCount = 4,
  difficulty: DragonDifficulty = 'normal',
  extraBoxes: BoxItem[] = []
): { sections: DragonSection[]; success: boolean; message: string; solutionOrder: BoxItem[] } {
  const solveRes = solveBoxLayout(boxes);
  if (!solveRes.success) {
    return {
      sections: [],
      success: false,
      message: solveRes.error || 'Failed to find a clear path solution.',
      solutionOrder: [],
    };
  }

  const solutionOrder = [...solveRes.solutionOrder, ...extraBoxes];
  if (solutionOrder.length === 0) {
    return {
      sections: [],
      success: true,
      message: 'No boxes on board.',
      solutionOrder: [],
    };
  }

  interface SlottedBox {
    box: BoxItem;
    needed: number;
  }

  const availableQueue = solutionOrder.map((b) => ({ ...b }));
  const activeSlots: SlottedBox[] = [];

  function refillSlots() {
    while (activeSlots.length < slotCount && availableQueue.length > 0) {
      const b = availableQueue.shift()!;
      activeSlots.push({ box: b, needed: b.capacity });
    }
  }

  refillSlots();
  const rawSections: DragonSection[] = [];

  while (activeSlots.length > 0) {
    const lastSec = rawSections.length > 0 ? rawSections[rawSections.length - 1] : null;
    const lastColor = lastSec ? lastSec.color : null;
    const lastCount = lastSec ? lastSec.count : 0;
    const room = 10 - lastCount;

    const diffSlots = activeSlots.filter((s) => s.box.color !== lastColor);
    const sameSlots = activeSlots.filter((s) => s.box.color === lastColor);

    let chosenSlot: SlottedBox | null = null;
    let chosenChunk = 0;
    let extendLast = false;

    if (difficulty === 'easy') {
      // Easy: Group wool by color up to 10 knots per segment
      if (sameSlots.length > 0 && room >= 2) {
        const valids = getValidChunkSizes(sameSlots[0].needed, room);
        if (valids.length > 0) {
          chosenSlot = sameSlots[0];
          chosenChunk = Math.max(...valids);
          extendLast = true;
        }
      }
      if (!chosenSlot && diffSlots.length > 0) {
        chosenSlot = diffSlots[0];
        const valids = getValidChunkSizes(chosenSlot.needed, 10);
        chosenChunk = Math.max(...valids);
      } else if (!chosenSlot && sameSlots.length > 0) {
        chosenSlot = sameSlots[0];
        const valids = getValidChunkSizes(chosenSlot.needed, 10);
        chosenChunk = Math.max(...valids);
      }
    } else if (difficulty === 'normal') {
      // Normal: Moderate interleaving with chunks of 2 to 5
      const canExtend = sameSlots.length > 0 && room >= 2 && lastCount < 6;
      const preferDiff = diffSlots.length > 0 && (Math.random() < 0.7 || !canExtend);

      if (preferDiff) {
        chosenSlot = diffSlots[0];
        const valids = getValidChunkSizes(chosenSlot.needed, 10);
        const moderate = valids.filter((c) => c <= 5);
        chosenChunk = moderate.length > 0 ? moderate[Math.floor(Math.random() * moderate.length)] : valids[0];
      } else if (canExtend) {
        const valids = getValidChunkSizes(sameSlots[0].needed, room);
        if (valids.length > 0) {
          chosenSlot = sameSlots[0];
          const moderate = valids.filter((c) => c <= 4);
          chosenChunk = moderate.length > 0 ? moderate[Math.floor(Math.random() * moderate.length)] : valids[0];
          extendLast = true;
        }
      }

      if (!chosenSlot) {
        const target = diffSlots.length > 0 ? diffSlots[0] : activeSlots[0];
        const valids = getValidChunkSizes(target.needed, 10);
        chosenSlot = target;
        chosenChunk = valids[0];
      }
    } else {
      // Hard: Higher interleaving with small chunks of 2-3 (never less than 2)
      const preferDiff = diffSlots.length > 0;
      if (preferDiff) {
        chosenSlot = diffSlots[Math.floor(Math.random() * diffSlots.length)];
        const valids = getValidChunkSizes(chosenSlot.needed, 10);
        const small = valids.filter((c) => c <= 3);
        chosenChunk = small.length > 0 ? small[Math.floor(Math.random() * small.length)] : valids[0];
      } else {
        const valids = getValidChunkSizes(activeSlots[0].needed, 10);
        chosenSlot = activeSlots[0];
        chosenChunk = valids[0];
        if (lastSec && lastSec.color === chosenSlot.box.color && room >= chosenChunk) {
          extendLast = true;
        }
      }
    }

    if (!chosenSlot || chosenChunk <= 0) {
      break;
    }

    if (extendLast && lastSec) {
      lastSec.count += chosenChunk;
    } else {
      rawSections.push({
        color: chosenSlot.box.color,
        count: chosenChunk,
      });
    }

    chosenSlot.needed -= chosenChunk;

    if (chosenSlot.needed <= 0) {
      const idx = activeSlots.indexOf(chosenSlot);
      activeSlots.splice(idx, 1);
      refillSlots();
    } else {
      // Rotate active slot to the back to encourage alternating colors
      const idx = activeSlots.indexOf(chosenSlot);
      if (idx !== -1 && activeSlots.length > 1) {
        activeSlots.splice(idx, 1);
        activeSlots.push(chosenSlot);
      }
    }
  }

  const finalSections = enforceDragonSegmentConstraints(rawSections);
  const totalWool = finalSections.reduce((acc, s) => acc + s.count, 0);

  return {
    sections: finalSections,
    success: true,
    message: `Successfully generated ${finalSections.length} dragon sections (${totalWool} wool total) from solvable order!`,
    solutionOrder,
  };
}
