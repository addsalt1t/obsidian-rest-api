/**
 * Autolink service internal types
 */

/**
 * Internal entity info (extracted from frontmatter)
 */
export interface AutolinkEntityInternal {
  path: string;
  name: string;
  aliases: string[];
}

/**
 * Sorted name list entry (used in scan/linkify)
 */
export interface NameEntry {
  name: string;
  entity: AutolinkEntityInternal;
}
