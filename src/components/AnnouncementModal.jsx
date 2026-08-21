import { useEffect, useState } from "react";
import { audienceTag, UPLOADS_BASE } from "./announcementUtils";

const CLOSE_ANIMATION_MS = 200;

function AnnouncementModal({ post, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [closing, setClosing] = useState(false);

  const images = post.images || [];
  const hasMultipleImages = images.length > 1;
  const tag = audienceTag(post);

  const requestClose = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  };

  const showPrev = () => setActiveIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const showNext = () => setActiveIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") requestClose();
      if (e.key === "ArrowLeft" && hasMultipleImages) showPrev();
      if (e.key === "ArrowRight" && hasMultipleImages) showNext();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMultipleImages]);

  return (
    <div
      className={`ann-lightbox-overlay ${closing ? "ann-lightbox-closing" : ""}`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label="Announcement details"
    >
      <div className="ann-lightbox-panel" onClick={(e) => e.stopPropagation()}>
        <button className="ann-lightbox-close" onClick={requestClose} aria-label="Close">
          <i className="bi bi-x-lg"></i>
        </button>

        {images.length > 0 && (
          <div className="ann-lightbox-image-wrap">
            <img
              key={images[activeIndex].image_id}
              src={`${UPLOADS_BASE}/${images[activeIndex].image_path}`}
              alt="Barangay announcement"
              className="ann-lightbox-image"
            />
            {hasMultipleImages && (
              <>
                <button className="ann-lightbox-nav ann-lightbox-nav-prev" onClick={showPrev} aria-label="Previous photo">
                  <i className="bi bi-chevron-left"></i>
                </button>
                <button className="ann-lightbox-nav ann-lightbox-nav-next" onClick={showNext} aria-label="Next photo">
                  <i className="bi bi-chevron-right"></i>
                </button>
                <div className="ann-lightbox-dots">
                  {images.map((img, i) => (
                    <button
                      key={img.image_id}
                      className={`ann-lightbox-dot ${i === activeIndex ? "active" : ""}`}
                      onClick={() => setActiveIndex(i)}
                      aria-label={`Show photo ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="ann-lightbox-body">
          <div className="ann-lightbox-meta">
            <span className="ann-feed-date">
              {new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </span>
            {tag && <span className="ann-feed-tag">{tag}</span>}
          </div>
          {post.caption && <p className="ann-lightbox-caption">{post.caption}</p>}
        </div>
      </div>
    </div>
  );
}

export default AnnouncementModal;
