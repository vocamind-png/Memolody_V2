/**
 * [Scorelens V2] useScrollSync Hook
 * ===================================
 * Keeps the Original Image panel and the Verovio Score panel
 * scrolled in lock-step, using the SystemSyncInfo from LayoutSyncService.
 *
 * Usage:
 *   const { imageRef, scoreRef, onImageScroll } = useScrollSync(syncInfo);
 *
 *   <div ref={imageRef} onScroll={onImageScroll}>  ← original image panel
 *   <div ref={scoreRef}>                            ← verovio score panel
 */

import { useRef, useCallback, useEffect, type RefObject } from 'react';
import { buildScrollSyncMap, syncScroll, type SystemSyncInfo } from './LayoutSyncService';

export interface ScrollSyncRefs {
  /** Attach to the original image scroll container */
  imageRef: RefObject<HTMLDivElement>;
  /** Attach to the Verovio score scroll container */
  scoreRef: RefObject<HTMLDivElement>;
  /** Call this on the image panel's onScroll event */
  onImageScroll: () => void;
  /** Call this on the score panel's onScroll event */
  onScoreScroll: () => void;
}

/**
 * Returns scroll sync refs and handlers.
 *
 * @param syncInfo   Result of computeLayoutSync() — contains systemBreakRatios.
 * @param pageCount  Number of Verovio SVG pages rendered.
 * @param enabled    Set to false to disable sync (e.g. when user manually scrolls score).
 */
export function useScrollSync(
  syncInfo: SystemSyncInfo | null,
  pageCount: number = 1,
  enabled: boolean = true
): ScrollSyncRefs {
  const imageRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const isSyncingImage = useRef(false);
  const isSyncingScore = useRef(false);

  // Build the sync map when syncInfo changes
  const syncMap = syncInfo
    ? buildScrollSyncMap(syncInfo.systemBreakRatios, pageCount)
    : [];

  const onImageScroll = useCallback(() => {
    if (!enabled || !imageRef.current || !scoreRef.current || isSyncingImage.current) return;
    if (syncMap.length === 0) return;

    isSyncingScore.current = true;

    const el = imageRef.current;
    const scrollRatio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
    const targetRatio = syncScroll(scrollRatio, syncMap);

    const scoreEl = scoreRef.current;
    scoreEl.scrollTop = targetRatio * Math.max(1, scoreEl.scrollHeight - scoreEl.clientHeight);

    // Release lock after a short delay to avoid feedback loops
    setTimeout(() => { isSyncingScore.current = false; }, 50);
  }, [syncMap, enabled]);

  const onScoreScroll = useCallback(() => {
    if (!enabled || !imageRef.current || !scoreRef.current || isSyncingScore.current) return;
    if (syncMap.length === 0) return;

    isSyncingImage.current = true;

    // Reverse sync: score → image
    const scoreEl = scoreRef.current;
    const scrollRatio = scoreEl.scrollTop / Math.max(1, scoreEl.scrollHeight - scoreEl.clientHeight);

    // Simple linear reverse (no complex reverse-sync map needed)
    const imageEl = imageRef.current;
    imageEl.scrollTop = scrollRatio * Math.max(1, imageEl.scrollHeight - imageEl.clientHeight);

    setTimeout(() => { isSyncingImage.current = false; }, 50);
  }, [syncMap, enabled]);

  // Reset scroll position when sync map changes
  useEffect(() => {
    if (imageRef.current) imageRef.current.scrollTop = 0;
    if (scoreRef.current) scoreRef.current.scrollTop = 0;
  }, [syncMap.length]);

  return { imageRef, scoreRef, onImageScroll, onScoreScroll };
}
