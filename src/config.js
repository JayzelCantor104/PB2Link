export const API_BASE = import.meta.env.MODE === 'development'
  ? '/api_backend'                        
  : 'https://pb2link.com/backend/api';    

// Uploaded files are stored as "uploads/..." relative to backend/api, so they
// are served from API_BASE too (one uploads root).
