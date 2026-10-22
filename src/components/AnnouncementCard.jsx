import { audienceTag, isPinned, UPLOADS_BASE } from "./announcementUtils";

function AnnouncementCard({ post, onOpen }) {
  const tag = audienceTag(post);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(post);
    }
  };

  return (
    <article
      className={`ann-feed-card${isPinned(post) ? " is-pinned" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(post)}
      onKeyDown={handleKeyDown}
    >
      <div className="ann-feed-card-head">
        <span className="ann-feed-date">
          {new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </span>
        {isPinned(post) && <span className="ann-feed-pin"><i className="bi bi-pin-angle-fill"></i> Pinned</span>}
        {tag && <span className="ann-feed-tag">{tag}</span>}
      </div>

      {post.title && <h3 className="ann-feed-headline">{post.title}</h3>}
      {post.caption && <p className="ann-feed-caption">{post.caption}</p>}

      {/* The photo strip scrolls sideways: focusable so arrow keys can scroll it (WCAG 2.1.1). */}
      {post.images && post.images.length > 0 && (
        <div className="ann-feed-gallery" tabIndex={0} role="region" aria-label={`Photos (${post.images.length})`}>
          {post.images.map((img, i) => (
            <img key={img.image_id} src={`${UPLOADS_BASE}/${img.image_path}`} alt={`Photo ${i + 1} of ${post.images.length}${post.title ? `: ${post.title}` : ''}`} loading="lazy" />
          ))}
        </div>
      )}
    </article>
  );
}

export default AnnouncementCard;
