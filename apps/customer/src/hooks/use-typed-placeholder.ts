import { useEffect, useState } from 'react';
import { useIsReduceMotionEnabled } from './use-reduce-motion';

const TYPE_MS = 45;
const DELETE_MS = 22;
const HOLD_MS = 1500;
const PAUSE_MS = 600;

/**
 * Cycles through `phrases` with a typewriter effect, typing each out character
 * by character, holding on the full phrase, then deleting it before the next.
 *
 * Respects the system reduced-motion setting by pinning the first phrase.
 * `phrases` should be a stable module-level constant so the loop is not
 * restarted on every render.
 */
export function useTypedPlaceholder(phrases: string[]): string {
  const reduceMotion = useIsReduceMotionEnabled();
  const [text, setText] = useState('');

  useEffect(() => {
    if (phrases.length === 0 || reduceMotion) return;

    let phraseIndex = 0;
    let charCount = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const target = phrases[phraseIndex] ?? phrases[0];
      if (deleting) {
        charCount -= 1;
        setText((target ?? '').slice(0, charCount));
        timer = setTimeout(tick, charCount === 0 ? PAUSE_MS : DELETE_MS);
        if (charCount === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
        }
      } else {
        charCount += 1;
        setText((target ?? '').slice(0, charCount));
        timer = setTimeout(tick, charCount === (target ?? '').length ? HOLD_MS : TYPE_MS);
        if (charCount === (target ?? '').length) deleting = true;
      }
    };

    timer = setTimeout(tick, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phrases, reduceMotion]);

  // When motion is off there is nothing to animate: pin the first phrase.
  const pinned = reduceMotion ? (phrases[0] ?? '') : undefined;

  return pinned ?? text;
}
