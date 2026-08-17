import { describe, expect, it } from 'vitest';
import { fetchTrustCenter, fetchTrustProfile } from '../src/fetch';

/**
 * Does the live API still return what this package's types claim?
 *
 * These components declare their own view of the published artifact rather than
 * importing it from the platform, so that a change inside Trusta cannot alter a
 * public package's type surface by accident. The cost of that choice is that
 * nothing checks the two still agree — the compile-time assertion that did it
 * only worked while both lived in one repository.
 *
 * This is the replacement, and it is the stronger check: it reads the real
 * endpoint rather than a type sitting in the same tree. It is opt-in because a
 * unit suite that fails when a network is unavailable is a unit suite people
 * learn to ignore:
 *
 *     TRUSTA_LIVE_CONTRACT=1 npm test -w @trusta/react
 *
 * Worth running on a schedule against production, and before any release.
 */

const live = process.env['TRUSTA_LIVE_CONTRACT'] === '1';
const org = process.env['TRUSTA_LIVE_ORG'] ?? 'menico';

describe.skipIf(!live)('live published contract', () => {
  it('returns a trust center with the fields the components read', async () => {
    const result = await fetchTrustCenter(org);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { organization, systems } = result.data;
    expect(typeof organization.slug).toBe('string');
    expect(typeof organization.name).toBe('string');
    expect(Array.isArray(systems)).toBe(true);

    for (const system of systems) {
      expect(typeof system.slug).toBe('string');
      expect(typeof system.name).toBe('string');
      expect(Number.isNaN(Date.parse(system.publishedAt))).toBe(false);
      expect(typeof system.summary.passCount).toBe('number');
      expect(typeof system.summary.totalControls).toBe('number');
      expect([
        'pass',
        'fail',
        'stale',
        'degraded',
        'unknown',
      ]).toContain(system.summary.overallState);
    }
  });

  it('returns a profile with the fields the card reads', async () => {
    const center = await fetchTrustCenter(org);
    expect(center.ok).toBe(true);
    if (!center.ok) return;

    const first = center.data.systems[0];
    if (!first) return; // Nothing published; the shape check above still ran.

    const result = await fetchTrustProfile(org, first.slug);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const profile = result.data;
    expect(typeof profile.project.name).toBe('string');
    expect(Number.isNaN(Date.parse(profile.publishedAt))).toBe(false);
    expect(Array.isArray(profile.controls)).toBe(true);

    for (const control of profile.controls) {
      expect(typeof control.key).toBe('string');
      expect(typeof control.name).toBe('string');
      expect([
        'pass',
        'fail',
        'stale',
        'degraded',
        'unknown',
      ]).toContain(control.state);
    }
  });

  it('does not return anything document-shaped', async () => {
    // The boundary, checked against the real response rather than a fixture:
    // documents are gated and cookie-bound, and nothing about them may reach a
    // component rendering on someone else's domain.
    const center = await fetchTrustCenter(org);
    if (!center.ok) return;
    const first = center.data.systems[0];
    if (!first) return;

    const result = await fetchTrustProfile(org, first.slug);
    if (!result.ok) return;

    const keys = Object.keys(result.data as unknown as Record<string, unknown>);
    expect(keys).not.toContain('files');
    expect(keys).not.toContain('documents');
  });
});
