/**
 * Autolink service constants
 */

const KO_BASE_PARTICLES = [
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '야', '도', '만',
  '에게', '에서', '으로', '로', '부터', '까지',
  '라고', '이라고', '라는', '이라는',
] as const;

const KO_PARTICLE_COMBINATION_RULES: Readonly<Record<string, readonly string[]>> = {
  '에': ['는', '도', '만'],
  '에서': ['는', '도', '만', '의'],
  '에게': ['는', '도', '만', '서'],
  '으로': ['는', '도', '만', '부터'],
  '로': ['는', '도', '만', '부터'],
};

function buildKoreanParticlePattern(): string {
  const particles = new Set<string>(KO_BASE_PARTICLES);

  for (const [stem, suffixes] of Object.entries(KO_PARTICLE_COMBINATION_RULES)) {
    particles.add(stem);
    for (const suffix of suffixes) {
      particles.add(`${stem}${suffix}`);
    }
  }

  return Array.from(particles)
    .sort((a, b) => b.length - a.length)
    .join('|');
}

/** Korean particle pattern (matches particles appended after entity names) */
export const KO_PARTICLES = buildKoreanParticlePattern();

/** Match context window size (before) */
export const CONTEXT_WINDOW_BEFORE = 25;

/** Match context window size (after) */
export const CONTEXT_WINDOW_AFTER = 25;

/** Maximum number of aliases per entity */
export const MAX_ALIASES = 20;
