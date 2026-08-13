<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "http://localhost:5173"
    Header set Access-Control-Allow-Methods "POST, GET, OPTIONS, DELETE, PUT"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
    Header set Access-Control-Allow-Credentials "true"
</IfModule>

# Handle OPTIONS requests
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]