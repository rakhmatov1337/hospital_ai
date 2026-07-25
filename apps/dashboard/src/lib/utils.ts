import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `cn` — the shadcn class combiner (clsx + tailwind-merge).
 *
 * tailwind-merge is taught about the app's custom design tokens so it classifies
 * them correctly when a shadcn component's classes are merged with ours. Without
 * this, a custom font-size like `text-button` is mistaken for a text-COLOUR and
 * silently strips shadcn's `text-primary-foreground` (dark label on a filled
 * button); custom radii/heights would collide the same way.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "body-l", "body", "caption", "button"] }],
      rounded: [{ rounded: ["card", "input"] }],
      h: [{ h: ["input", "row"] }],
      "min-h": [{ "min-h": ["input", "row"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
