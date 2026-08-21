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
