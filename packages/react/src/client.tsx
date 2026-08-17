'use client';

import { useEffect, useState } from 'react';
import {
  canonicalOrgUrl,
  canonicalProjectUrl,
  fetchTrustCenter,
  fetchTrustProfile,
} from './fetch';
import {
  BadgeView,
  CardView,
  CenterView,
  StripView,
  Unavailable,
  paletteFor,
} from './view';
import type {
  TrustCenterData,
  TrustEmbedProps,
  TrustProfile,
  TrustProjectEmbedProps,
} from './types';

/**
 * The client fallback.
 *
 * Same four components, same rendering — only the fetch moves to the browser.
 * For a SPA or any page without a server render, this is the entry point; on
 * Next, prefer the server components from `@trusta/react`, which cost the
 * visitor nothing.
 *
 * There is no loading spinner. A widget that flashes a spinner on someone's
 * homepage is worse than one that appears when it has something true to say,
 * so these render nothing until the first response arrives.
 */

type Loaded<T> =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'unavailable' };

function useTrustData<T>(
  load: (
    signal: AbortSignal,
  ) => Promise<{ ok: true; data: T } | { ok: false; reason: string }>,
  deps: readonly unknown[],
): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'pending' });

  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    void load(controller.signal).then((result) => {
      if (!live) return;
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'unavailable' },
      );
    });

    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function TrustCenter(props: TrustEmbedProps) {
  const palette = paletteFor(props.theme);
  const state = useTrustData<TrustCenterData>(
    (signal) =>
      fetchTrustCenter(props.org, {
        baseUrl: props.baseUrl,
        revalidateSeconds: props.revalidateSeconds,
        signal,
      }),
    [props.org, props.baseUrl, props.revalidateSeconds],
  );

  if (state.status === 'pending') return null;
  if (state.status === 'unavailable') {
    return (
      <Unavailable
        href={canonicalOrgUrl(props.org)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <CenterView
      org={props.org}
      data={state.data}
      palette={palette}
      className={props.className}
    />
  );
}

function useProfile(props: TrustProjectEmbedProps): Loaded<TrustProfile> {
  return useTrustData<TrustProfile>(
    (signal) =>
      fetchTrustProfile(props.org, props.project, {
        baseUrl: props.baseUrl,
        revalidateSeconds: props.revalidateSeconds,
        signal,
      }),
    [props.org, props.project, props.baseUrl, props.revalidateSeconds],
  );
}

export function TrustCard(props: TrustProjectEmbedProps) {
  const palette = paletteFor(props.theme);
  const state = useProfile(props);

  if (state.status === 'pending') return null;
  if (state.status === 'unavailable') {
    return (
      <Unavailable
        href={canonicalProjectUrl(props.org, props.project)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <CardView
      org={props.org}
      project={props.project}
      profile={state.data}
      palette={palette}
      className={props.className}
    />
  );
}

export function TrustStrip(props: TrustProjectEmbedProps) {
  const palette = paletteFor(props.theme);
  const state = useProfile(props);

  if (state.status === 'pending') return null;
  if (state.status === 'unavailable') {
    return (
      <Unavailable
        href={canonicalProjectUrl(props.org, props.project)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <StripView
      org={props.org}
      project={props.project}
      profile={state.data}
      palette={palette}
      className={props.className}
    />
  );
}

export function TrustBadge(props: TrustProjectEmbedProps) {
  const palette = paletteFor(props.theme);
  const state = useProfile(props);

  if (state.status === 'pending') return null;
  if (state.status === 'unavailable') {
    return (
      <Unavailable
        href={canonicalProjectUrl(props.org, props.project)}
        palette={palette}
        className={props.className}
      />
    );
  }

  return (
    <BadgeView
      org={props.org}
      project={props.project}
      profile={state.data}
      palette={palette}
      className={props.className}
    />
  );
}
