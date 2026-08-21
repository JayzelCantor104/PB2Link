import React, { useEffect, useState } from 'react';
import './Announcements.css';
import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';

const API_BASE = '/api_backend';
const UPLOADS_BASE = '/uploads_backend';
const SECTOR_OPTIONS = ['Senior Citizen', 'PWD', 'Solo Parent', 'Indigent', '4Ps'];
const MAX_IMAGES = 6;

const emptyComposer = {
  announcementId: null,
  caption: '',
  audienceType: 'Everyone',
  sectors: [],
  recipients: [], // { user_id, full_name }
  existingImages: [], // { image_id, image_path }
  removeImageIds: [],
  newImages: [], // { file, previewUrl }
};

const Announcements = () => {
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 10, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [showComposer, setShowComposer] = useState(false);
  const [composer, setComposer] = useState(emptyComposer);
  const [submitting, setSubmitting] = useState(false);

  const [residents, setResidents] = useState([]);
  const [residentQuery, setResidentQuery] = useState('');

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPosts = async (page = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/get_announcements_admin.php?page=${page}&page_size=${pagination.page_size}`, {
        credentials: 'include',
      });
      if (isAuthFailure(res.status)) return forceAdminReauth();
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
        setPagination(data.pagination);
      } else {
        showToast('Error', data.message || 'Failed to load announcements.', 'error');
      }
    } catch {
      showToast('Error', 'Network connectivity failure.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchResidents = async () => {
    try {
      const res = await fetch(`${API_BASE}/get_residents.php`, { credentials: 'include' });
      if (isAuthFailure(res.status)) return forceAdminReauth();
      const data = await res.json();
      if (data.success !== false) {
        setResidents(data.residents || data.data || []);
      }
    } catch {
      // Resident search is a composer convenience; a failure here shouldn't block the page.
    }
  };

  useEffect(() => {
    fetchPosts(1);
    fetchResidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateComposer = () => {
    setComposer(emptyComposer);
    setResidentQuery('');
    setShowComposer(true);
  };

  const openEditComposer = (post) => {
    setComposer({
      announcementId: post.announcement_id,
      caption: post.caption,
      audienceType: post.audience_type,
      sectors: post.target_sectors || [],
      recipients: (post.target_recipients || []).map((name) => ({ user_id: null, full_name: name })),
      existingImages: post.images || [],
      removeImageIds: [],
      newImages: [],
    });
    setResidentQuery('');
    setShowComposer(true);
  };

  const closeComposer = () => {
    composer.newImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setShowComposer(false);
    setComposer(emptyComposer);
  };

  const toggleSector = (sector) => {
    setComposer((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((s) => s !== sector)
        : [...prev.sectors, sector],
    }));
  };

  const addRecipient = (resident) => {
    setComposer((prev) => {
      if (prev.recipients.some((r) => r.user_id === resident.user_id)) return prev;
      return { ...prev, recipients: [...prev.recipients, resident] };
    });
    setResidentQuery('');
  };

  const removeRecipient = (userId) => {
    setComposer((prev) => ({ ...prev, recipients: prev.recipients.filter((r) => r.user_id !== userId) }));
  };

  const currentImageTotal = composer.existingImages.length - composer.removeImageIds.length + composer.newImages.length;

  const handleImagePick = (e) => {
    const files = Array.from(e.target.files || []);
    const room = MAX_IMAGES - currentImageTotal;
    if (room <= 0) {
      showToast('Limit reached', `Up to ${MAX_IMAGES} images per post.`, 'error');
      e.target.value = '';
      return;
    }
    const picked = files.slice(0, room).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setComposer((prev) => ({ ...prev, newImages: [...prev.newImages, ...picked] }));
    e.target.value = '';
  };

  const removeNewImage = (index) => {
    setComposer((prev) => {
      URL.revokeObjectURL(prev.newImages[index].previewUrl);
      return { ...prev, newImages: prev.newImages.filter((_, i) => i !== index) };
    });
  };

  const markExistingImageRemoved = (imageId) => {
    setComposer((prev) => ({ ...prev, removeImageIds: [...prev.removeImageIds, imageId] }));
  };

  const submitComposer = async (e) => {
    e.preventDefault();

    if (composer.caption.trim() === '' && currentImageTotal === 0) {
      showToast('Empty post', 'Add a caption or at least one photo.', 'error');
      return;
    }
    if (composer.audienceType === 'Sector' && composer.sectors.length === 0) {
      showToast('Missing audience', 'Select at least one sector.', 'error');
      return;
    }
    if (composer.audienceType === 'Specific' && composer.recipients.length === 0) {
      showToast('Missing audience', 'Select at least one resident.', 'error');
      return;
    }

    const isEdit = composer.announcementId !== null;
    const formData = new FormData();
    formData.append('caption', composer.caption.trim());
    formData.append('audience_type', composer.audienceType);
    composer.sectors.forEach((s) => formData.append('sectors[]', s));
    if (isEdit) {
      formData.append('announcement_id', composer.announcementId);
      composer.recipients.forEach((r) => r.user_id && formData.append('recipient_user_ids[]', r.user_id));
      composer.removeImageIds.forEach((id) => formData.append('remove_image_ids[]', id));
    } else {
      composer.recipients.forEach((r) => formData.append('recipient_user_ids[]', r.user_id));
    }
    composer.newImages.forEach((img) => formData.append('images[]', img.file));

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/${isEdit ? 'update_announcement.php' : 'create_announcement.php'}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (isAuthFailure(res.status)) return forceAdminReauth();
      const data = await res.json();
      if (data.success) {
        showToast('Posted', isEdit ? 'Announcement updated.' : 'Announcement posted.', 'success');
        closeComposer();
        fetchPosts(pagination.page);
      } else {
        showToast('Error', data.message || 'Could not save the announcement.', 'error');
      }
    } catch {
      showToast('Error', 'Network connectivity failure.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async (announcementId) => {
    if (!window.confirm('Delete this announcement permanently? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/delete_announcement.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcement_id: announcementId }),
      });
      if (isAuthFailure(res.status)) return forceAdminReauth();
      const data = await res.json();
      if (data.success) {
        showToast('Deleted', 'Announcement removed.', 'success');
        fetchPosts(pagination.page);
      } else {
        showToast('Error', data.message || 'Could not delete the announcement.', 'error');
      }
    } catch {
      showToast('Error', 'Network connectivity failure.', 'error');
    }
  };

  const audienceLabel = (post) => {
    if (post.audience_type === 'Everyone') return 'Everyone';
    if (post.audience_type === 'Sector') return `For: ${(post.target_sectors || []).join(', ')}`;
    const names = post.target_recipients || [];
    return `For: ${names.length} resident${names.length === 1 ? '' : 's'}`;
  };

  const matchingResidents = residentQuery.trim()
    ? residents
        .filter((r) => (r.full_name || '').toLowerCase().includes(residentQuery.toLowerCase()))
        .filter((r) => !composer.recipients.some((sel) => sel.user_id === r.user_id))
        .slice(0, 8)
    : [];

  return (
    <div className="ann-page">
      <div className="ann-header-row">
        <h3>Announcements</h3>
        <button className="ann-btn-primary" onClick={openCreateComposer}>
          <i className="fas fa-plus"></i> New Announcement
        </button>
      </div>

      {loading ? (
        <div className="ann-loading">Loading announcements...</div>
      ) : posts.length === 0 ? (
        <div className="ann-empty">No announcements yet. Create the first one.</div>
      ) : (
        <div className="ann-feed">
          {posts.map((post) => (
            <div className="ann-card" key={post.announcement_id}>
              <div className="ann-card-head">
                <div>
                  <span className="ann-posted-by">{post.posted_by}</span>
                  <span className="ann-date">{new Date(post.created_at).toLocaleString()}</span>
                </div>
                <span className={`ann-badge ann-badge-${post.audience_type.toLowerCase()}`}>{audienceLabel(post)}</span>
              </div>

              {post.caption && <p className="ann-caption">{post.caption}</p>}

              {post.images && post.images.length > 0 && (
                <div className={`ann-image-grid ann-image-grid-${Math.min(post.images.length, 4)}`}>
                  {post.images.map((img) => (
                    <img key={img.image_id} src={`${UPLOADS_BASE}/${img.image_path}`} alt="Announcement" />
                  ))}
                </div>
              )}

              <div className="ann-card-actions">
                <button className="ann-btn-icon" onClick={() => openEditComposer(post)} title="Edit">
                  <i className="fas fa-pen"></i> Edit
                </button>
                <button className="ann-btn-icon ann-btn-danger" onClick={() => deletePost(post.announcement_id)} title="Delete">
                  <i className="fas fa-trash"></i> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination.total_pages > 1 && (
        <div className="ann-pagination">
          <button disabled={pagination.page <= 1} onClick={() => fetchPosts(pagination.page - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.total_pages}</span>
          <button disabled={pagination.page >= pagination.total_pages} onClick={() => fetchPosts(pagination.page + 1)}>Next</button>
        </div>
      )}

      {showComposer && (
        <div className="ann-modal-overlay" onClick={closeComposer}>
          <div className="ann-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ann-modal-head">
              <h4>{composer.announcementId ? 'Edit Announcement' : 'New Announcement'}</h4>
              <button className="ann-modal-close" onClick={closeComposer}>&times;</button>
            </div>

            <form onSubmit={submitComposer} className="ann-form">
              <textarea
                className="ann-textarea"
                placeholder="Write an announcement..."
                value={composer.caption}
                maxLength={3000}
                onChange={(e) => setComposer((prev) => ({ ...prev, caption: e.target.value }))}
              />

              <div className="ann-image-picker">
                <div className="ann-image-previews">
                  {composer.existingImages
                    .filter((img) => !composer.removeImageIds.includes(img.image_id))
                    .map((img) => (
                      <div className="ann-preview-thumb" key={`existing-${img.image_id}`}>
                        <img src={`${UPLOADS_BASE}/${img.image_path}`} alt="Current" />
                        <button type="button" onClick={() => markExistingImageRemoved(img.image_id)}>&times;</button>
                      </div>
                    ))}
                  {composer.newImages.map((img, i) => (
                    <div className="ann-preview-thumb" key={`new-${i}`}>
                      <img src={img.previewUrl} alt="New upload" />
                      <button type="button" onClick={() => removeNewImage(i)}>&times;</button>
                    </div>
                  ))}
                </div>
                {currentImageTotal < MAX_IMAGES && (
                  <label className="ann-add-image-btn">
                    <i className="fas fa-image"></i> Add photos ({currentImageTotal}/{MAX_IMAGES})
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleImagePick} />
                  </label>
                )}
              </div>

              <div className="ann-audience">
                <label className="ann-audience-title">Show this to</label>
                <div className="ann-audience-choices">
                  {['Everyone', 'Sector', 'Specific'].map((type) => (
                    <label key={type} className="ann-radio">
                      <input
                        type="radio"
                        name="audience_type"
                        checked={composer.audienceType === type}
                        onChange={() => setComposer((prev) => ({ ...prev, audienceType: type }))}
                      />
                      {type === 'Specific' ? 'Specific People' : type}
                    </label>
                  ))}
                </div>

                {composer.audienceType === 'Sector' && (
                  <div className="ann-sector-checks">
                    {SECTOR_OPTIONS.map((sector) => (
                      <label key={sector} className="ann-checkbox">
                        <input
                          type="checkbox"
                          checked={composer.sectors.includes(sector)}
                          onChange={() => toggleSector(sector)}
                        />
                        {sector}
                      </label>
                    ))}
                  </div>
                )}

                {composer.audienceType === 'Specific' && (
                  <div className="ann-recipient-picker">
                    <input
                      type="text"
                      placeholder="Search resident by name..."
                      value={residentQuery}
                      onChange={(e) => setResidentQuery(e.target.value)}
                    />
                    {matchingResidents.length > 0 && (
                      <div className="ann-resident-dropdown">
                        {matchingResidents.map((r) => (
                          <div key={r.user_id} className="ann-resident-option" onClick={() => addRecipient(r)}>
                            {r.full_name}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ann-recipient-chips">
                      {composer.recipients.map((r, i) => (
                        <span key={r.user_id ?? i} className="ann-chip">
                          {r.full_name}
                          <button type="button" onClick={() => removeRecipient(r.user_id)}>&times;</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="ann-form-actions">
                <button type="button" className="ann-btn-secondary" onClick={closeComposer}>Cancel</button>
                <button type="submit" className="ann-btn-primary" disabled={submitting}>
                  {submitting ? 'Posting...' : composer.announcementId ? 'Save Changes' : 'Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`ann-toast ann-toast-${toast.type}`}>
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default Announcements;
