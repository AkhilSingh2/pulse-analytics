export type FunnelEvent = {
  actor: string;
  name: string;
  ts: number;
};

export type FunnelStepResult = {
  step: string;
  users: number;
  conversionFromStart: number;
  conversionFromPrev: number;
  medianMillisFromPrev: number | null;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Ordered funnel. A visitor reaches step N only after reaching step N-1,
 * using the earliest later event of that name. Steps may share a timestamp
 * when they are distinct events.
 */
export function computeFunnel(events: FunnelEvent[], steps: string[]): FunnelStepResult[] {
  if (steps.length === 0) return [];
  const allowed = new Set(steps);
  const byActor = new Map<string, FunnelEvent[]>();
  for (const event of events) {
    if (!allowed.has(event.name)) continue;
    const list = byActor.get(event.actor);
    if (list) list.push(event);
    else byActor.set(event.actor, [event]);
  }

  const users = steps.map(() => 0);
  const gaps = steps.map(() => [] as number[]);

  for (const list of byActor.values()) {
    list.sort((a, b) => a.ts - b.ts || a.name.localeCompare(b.name));
    let index = 0;
    let prevTs = Number.NEGATIVE_INFINITY;
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex]!;
      while (index < list.length && (list[index]!.ts < prevTs || list[index]!.name !== step)) {
        index += 1;
      }
      if (index >= list.length) break;
      const hit = list[index]!;
      users[stepIndex] += 1;
      if (stepIndex > 0) gaps[stepIndex]!.push(hit.ts - prevTs);
      prevTs = hit.ts;
      index += 1;
    }
  }

  return steps.map((step, index) => ({
    step,
    users: users[index]!,
    conversionFromStart: users[0] === 0 ? 0 : users[index]! / users[0]!,
    conversionFromPrev: index === 0 ? 1 : users[index - 1] === 0 ? 0 : users[index]! / users[index - 1]!,
    medianMillisFromPrev: index === 0 ? null : median(gaps[index]!),
  }));
}
