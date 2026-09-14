/**
 * Renders the tiny inline markup our dictionaries use, so a translated
 * sentence can keep its emphasis without being chopped into one key per
 * fragment:
 *
 *     **bold**   *italic*   `code`
 *
 * Anything else passes through as plain text.
 */

import type { ReactNode } from "react";

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function rich(text: string): ReactNode {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <b key={i}>{part.slice(2, -2)}</b>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
