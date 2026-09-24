export const API_BASE = import.meta.env.MODE === 'development'
  ? '/api_backend'                        
  : 'https://pb2link.com/backend/api';    

export const UPLOADS_BASE = import.meta.env.MODE === 'development'
  ? '/uploads_backend'                 
  : 'https://pb2link.com/backend/uploads';