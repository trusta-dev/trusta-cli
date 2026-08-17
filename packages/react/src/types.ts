/**
 * The published artifact, as an embed sees it.
 *
 * Declared here rather than imported from `@trusta/types` on purpose. This
 * package goes into other people's applications, so its type surface is a
 * public contract with semver obligations, and an internal type change must not
 * be able to alter it by accident. The compatibility of the two is asserted in
 * the test suite instead, where drift shows up as a failing build rather than
 * as a breaking change in someone else's `pnpm install`.
 *
 * It is also deliberately a subset. Nothing here describes documents: those are
 * gated, cookie-bound and served live, and an embed must never render them.
 */

export type TrustState = 'unknown' | 'pass' | 'fail' | 'stale' | 'degraded';

export type TrustControlCategory =
  | 'collector'
  | 'evidence'
  | 'security'
  | 'detection';

export interface TrustSummary {
  readonly overallState: TrustState;
  readonly totalControls: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly staleCount: number;
  readonly degradedCount: number;
  readonly unknownCount: number;
}

export interface TrustControl {
  readonly key: string;
  readonly category: TrustControlCategory;
  readonly name: string;
  readonly state: TrustState;
  readonly latestEvidenceAt: string | null;
}

export interface TrustProject {
  readonly slug: string;
  readonly name: string;
}

export interface TrustProfile {
  readonly project: TrustProject;
  readonly version: number;
  readonly publishedAt: string;
  readonly summary: TrustSummary;
  readonly controls: readonly TrustControl[];
  readonly description?: string | null;
}

export interface TrustSystem {
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly publishedAt: string;
  readonly summary: TrustSummary;
  readonly description: string | null;
}

export interface TrustCenterData {
  readonly organization: { readonly slug: string; readonly name: string };
  readonly systems: readonly TrustSystem[];
}

/**
 * Props every variant accepts.
 *
 * `org` and `project` select. Appearance is a prop. **State is not**, and there
 * is deliberately no way to add it: a component that accepted `passing={24}`
 * would let anyone render a perfect score with no evidence behind it, on their
 * own domain, wearing Trusta's mark — which refutes the product's entire claim
 * in one line of JSX (ADR 0015).
 */
export interface TrustEmbedProps {
  readonly org: string;
  /** Defaults to Trusta's public read plane. Override for self-hosting. */
  readonly baseUrl?: string;
  /** `auto` follows the host page's colour scheme. */
  readonly theme?: 'light' | 'dark' | 'auto';
  readonly className?: string;
  /**
   * Seconds the host framework may serve this from cache. Also what it serves
   * if Trusta is unreachable when it revalidates, which is the intended
   * behaviour — a stale reading with its own timestamp is better than a hole in
   * someone's homepage.
   */
  readonly revalidateSeconds?: number;
}

export interface TrustProjectEmbedProps extends TrustEmbedProps {
  readonly project: string;
}
