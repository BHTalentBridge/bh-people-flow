import type { Transition, Variants } from 'motion/react';

/**
 * Motion vocabulary for the whole app. Everything is fast (150–300ms) and
 * ease-out — motion is here to explain a state change, not to perform.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const springish: Transition = { duration: 0.22, ease: EASE };
export const quick: Transition = { duration: 0.15, ease: EASE };

/**
 * Page-level: content rises 4px as it fades in.
 *
 * **Enter only, on purpose.** A page-exit animation has to finish before the
 * next page can render, which both delays every navigation and — when a
 * transition is interrupted — can leave the incoming page stuck at `initial`.
 * See the comment in AppShell. Navigation should feel immediate, so the new
 * page just appears and fades up.
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE } },
};

/**
 * Keyed panel swap — a tab body, or anything that re-renders under a new key.
 *
 * Enter-only for the same reason as `pageVariants`: an exit animation under
 * `AnimatePresence mode="wait"` blocks the incoming panel from mounting, which
 * both adds latency to every switch and can strand the new panel at `initial`
 * (invisible) if the user switches again mid-transition.
 */
export const panelVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE } },
};

/** Container that reveals its children in a quick cascade. */
export const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: EASE } },
};

/** Table rows collapse their own height on delete, so the list closes smoothly. */
export const rowVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: EASE } },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.18, ease: EASE },
  },
};

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

export const modalPanel: Variants = {
  initial: { opacity: 0, scale: 0.975, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, scale: 0.985, y: 4, transition: { duration: 0.13, ease: EASE } },
};
