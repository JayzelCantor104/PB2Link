import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnnouncementCard from "./AnnouncementCard";
import AnnouncementModal from "./AnnouncementModal";
import "../styles/announcements.css";

const API_BASE = "/api_backend";

function AnnouncementsFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/get_public_announcements.php`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setPosts(data.data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  if (!loading && posts.length === 0) return null;

  return (
    <section className="ann-feed-section">
      <div className="ann-feed-container">
        <div className="ann-feed-header">
          <div>
            <span className="badge-gold">Barangay Updates</span>
            <h2>Announcements</h2>
          </div>
          <Link to="/announcements" className="ann-feed-view-all">
            Past Announcements <i className="bi bi-arrow-right"></i>
          </Link>
        </div>

        {loading ? (
          <div className="ann-feed-loading">Loading announcements...</div>
        ) : (
          <div className="ann-feed-grid">
            {posts.map((post) => (
              <AnnouncementCard key={post.announcement_id} post={post} onOpen={setSelectedPost} />
            ))}
          </div>
        )}
      </div>

      {selectedPost && <AnnouncementModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </section>
  );
}

export default AnnouncementsFeed;
