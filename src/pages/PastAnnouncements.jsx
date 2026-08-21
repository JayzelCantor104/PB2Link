import { useEffect, useState } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Preloader from "../components/Preloader";
import AnnouncementCard from "../components/AnnouncementCard";
import AnnouncementModal from "../components/AnnouncementModal";
import "../styles/announcements.css";

const API_BASE = "/api_backend";
const PAGE_SIZE = 12;

function PastAnnouncements() {
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);

  const loadPage = (page) => {
    setLoading(true);
    fetch(`${API_BASE}/get_announcements_archive.php?page=${page}&page_size=${PAGE_SIZE}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPosts(data.data);
          setPagination(data.pagination);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPage(1);
  }, []);

  return (
    <>
      <Preloader />
      <Header />

      <section className="ann-archive-section">
        <div className="ann-feed-container">
          <div className="ann-archive-header">
            <span className="badge-gold">Barangay Updates</span>
            <h2>Past Announcements</h2>
            <p>Browse through everything the barangay has posted.</p>
          </div>

          {loading ? (
            <div className="ann-feed-loading">Loading announcements...</div>
          ) : posts.length === 0 ? (
            <div className="ann-feed-loading">No announcements to show yet.</div>
          ) : (
            <div className="ann-feed-grid">
              {posts.map((post) => (
                <AnnouncementCard key={post.announcement_id} post={post} onOpen={setSelectedPost} />
              ))}
            </div>
          )}

          {pagination.total_pages > 1 && (
            <div className="ann-archive-pagination">
              <button disabled={pagination.page <= 1} onClick={() => loadPage(pagination.page - 1)}>
                <i className="bi bi-arrow-left"></i> Previous
              </button>
              <span>Page {pagination.page} of {pagination.total_pages}</span>
              <button disabled={pagination.page >= pagination.total_pages} onClick={() => loadPage(pagination.page + 1)}>
                Next <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          )}
        </div>
      </section>

      <Footer />

      {selectedPost && <AnnouncementModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </>
  );
}

export default PastAnnouncements;
