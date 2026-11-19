/**
 * Average-linkage hierarchical agglomerative clustering (ARCHITECTURE §5.8 step 3).
 *
 * Items are referred to by index; the caller passes them in canonical order. The closest
 * pair of groups is merged while its average linkage is ≤ τ. Ties go to the lexicographically
 * smallest pair (min index of the first group, then of the second). Pairs at +∞ never merge.
 */

/**
 * Groups `n` items. `dist(i, j)` must be symmetric and is called once per pair (i < j).
 * Returns groups as ascending index lists, ordered by their first index.
 */
export function averageLinkageHac(n: number, dist: (i: number, j: number) => number, tau: number): number[][] {
  const groups: number[][] = [];
  // sums[a][b] = Σ d over member pairs of groups a and b (kept symmetric).
  const sums: number[][] = [];
  for (let i = 0; i < n; i++) {
    groups.push([i]);
    sums.push(new Array<number>(n).fill(0));
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(i, j);
      setSym(sums, i, j, d);
    }
  }
  for (;;) {
    const best = closestPair(groups, sums);
    if (best === null || !(best.linkage <= tau)) break;
    mergeInto(groups, sums, best.a, best.b);
  }
  return groups;
}

function get(m: readonly (readonly number[])[], i: number, j: number): number {
  return m[i]?.[j] ?? Infinity;
}

function setSym(m: number[][], i: number, j: number, v: number): void {
  const ri = m[i];
  const rj = m[j];
  if (ri) ri[j] = v;
  if (rj) rj[i] = v;
}

/** Smallest-linkage pair; strict `<` in scan order gives the lexicographic tie-break. */
function closestPair(groups: readonly (readonly number[])[], sums: readonly (readonly number[])[]) {
  let best: { a: number; b: number; linkage: number } | null = null;
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      const size = (groups[a]?.length ?? 0) * (groups[b]?.length ?? 0);
      const linkage = get(sums, a, b) / size;
      if (best === null || linkage < best.linkage) best = { a, b, linkage };
    }
  }
  return best;
}

/** Merges group b into group a (a < b) and drops row/column b. */
function mergeInto(groups: number[][], sums: number[][], a: number, b: number): void {
  for (let m = 0; m < groups.length; m++) {
    if (m === a || m === b) continue;
    setSym(sums, a, m, get(sums, a, m) + get(sums, b, m));
  }
  const ga = groups[a];
  const gb = groups[b];
  if (ga && gb) groups[a] = [...ga, ...gb].sort((x, y) => x - y);
  groups.splice(b, 1);
  sums.splice(b, 1);
  for (const row of sums) row.splice(b, 1);
}
