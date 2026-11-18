/** Words that carry no topic signal. */
const STOP = new Set(['the', 'and', 'for', 'with', 'api', 'les', 'des', 'pour', 'avec', 'une', 'un', 'de', 'la', 'le', 'du', 'of', 'to', 'in', 'on', 'a']);

export function topicTokens(topic: string): string[] {
  return [
    ...new Set(
      topic
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOP.has(t)),
    ),
  ];
}

export interface ExpertSignals {
  specialties: string[];
  currentTask: string | null;
  recentSummaries: string[];
}

/**
 * Transparent expertise score: declared specialties weigh most, then what the agent says it works on,
 * then what it recently did. Every point comes with a human-readable reason.
 */
export function scoreExpert(tokens: string[], signals: ExpertSignals): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const specialties = signals.specialties.map((s) => s.toLowerCase());
  const matchedSpecialties = tokens.filter((t) => specialties.some((s) => s.includes(t)));
  if (matchedSpecialties.length) {
    score += 5 * matchedSpecialties.length;
    reasons.push(`specialty: ${matchedSpecialties.join(', ')}`);
  }
  const task = signals.currentTask?.toLowerCase() ?? '';
  const matchedTask = tokens.filter((t) => task.includes(t));
  if (matchedTask.length) {
    score += 3 * matchedTask.length;
    reasons.push(`currently: ${signals.currentTask}`);
  }
  const hits = signals.recentSummaries.filter((s) => tokens.some((t) => s.toLowerCase().includes(t)));
  if (hits.length) {
    score += Math.min(hits.length, 5);
    reasons.push(`${hits.length} recent related activit${hits.length > 1 ? 'ies' : 'y'}`);
  }
  return { score, reasons };
}
