export const UPLOADS_BASE = "/uploads_backend";

export function audienceTag(post) {
  if (post.audience_type === "Sector" && post.target_sectors?.length) {
    return `For you: ${post.target_sectors.join(", ")}`;
  }
  if (post.audience_type === "Specific") {
    return "Just for you";
  }
  return null;
}

export const isPinned = (post) => Number(post?.is_pinned) === 1;

/**
 * The line to show where there's room for one: the headline (migration 025),
 * or else the caption's first line, cut at a word to about 90 characters.
 */
export function headlineOf(post) {
  if (post?.title) return post.title;
  const first = String(post?.caption || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  if (!first) return 'Photo update';
  if (first.length <= 90) return first;
  const cut = first.slice(0, 90);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)).trim() + '…';
}
