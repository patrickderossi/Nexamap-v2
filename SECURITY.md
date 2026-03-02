# Security Configuration

This document outlines the security measures implemented in the NexaMap application.

## Overview

NexaMap implements comprehensive security measures to protect user data and ensure secure operation in production environments.

## Security Headers

### Helmet Configuration

The application uses [Helmet](https://helmetjs.github.io/) to set various HTTP security headers:

- **Content Security Policy (CSP)**: Prevents XSS attacks by controlling resource loading
- **HTTP Strict Transport Security (HSTS)**: Forces HTTPS connections
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Referrer Policy**: Controls referrer information sharing

### Content Security Policy (CSP)

The CSP is configured to allow:

- Scripts: Self, Google Maps API, Unpkg (for Leaflet)
- Styles: Self, inline styles, Google Fonts, Unpkg
- Images: Self, data URLs, HTTPS sources, blob URLs
- Connections: Self, HTTPS, WebSocket connections
- Fonts: Self, Google Fonts

## CORS Configuration

### Environment-Based Origins

CORS is configured based on the environment:

**Development:**

- `http://localhost:8080`
- `http://localhost:8081`
- `http://localhost:3000`

**Production:**

- Primary domain from `FRONTEND_URL` environment variable
- Additional domains from `ADDITIONAL_ORIGINS` (comma-separated)

### CORS Settings

- **Credentials**: Enabled for authenticated requests
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization, X-Requested-With
- **Exposed Headers**: Rate limit information

## Rate Limiting

### General Rate Limiting

- **Window**: 15 minutes
- **Limit**: 100 requests/IP in production, 1000 in development
- **Headers**: Includes rate limit information in response headers

### Authentication Rate Limiting

Stricter limits for authentication endpoints:

- **Window**: 15 minutes
- **Limit**: 10 authentication attempts per IP
- **Protection**: Prevents brute force attacks

## Environment Variables

Required security-related environment variables:

```bash
# Production domain for CORS
FRONTEND_URL=https://your-domain.com

# Additional allowed origins (optional)
ADDITIONAL_ORIGINS=https://app.your-domain.com,https://staging.your-domain.com

# Environment setting (affects security strictness)
NODE_ENV=production

# Trusted IPs that skip rate limiting (optional, comma-separated)
TRUSTED_IPS=127.0.0.1,::1,health-check-ip

# Supabase URL (for CSP configuration)
VITE_SUPABASE_URL=https://your-project.supabase.co
```

## Database Security

### Supabase Configuration

- **Row Level Security (RLS)**: Enabled on all tables
- **JWT Authentication**: Server-side token verification
- **Service Role**: Separate key for server operations
- **Connection Security**: TLS encryption for all connections

### User Data Protection

- **Profile Access**: Users can only access their own profiles
- **Authentication Required**: Protected endpoints require valid JWT
- **Email Verification**: Optional email confirmation flow

## API Security

### Authentication Middleware

- **JWT Verification**: All protected routes verify tokens
- **User Context**: Authenticated user information available in requests
- **Optional Auth**: Some routes support optional authentication

### Error Handling

Secure error responses:

- **Production**: Generic error messages
- **Development**: Detailed error information
- **CORS Errors**: Clear feedback for policy violations
- **Rate Limit**: Informative rate limit exceeded messages

## Security Testing

### Test Endpoints

- **Health Check**: `/api/ping` - Basic connectivity test
- **Security Check**: `/api/security-check` - Verify security configuration

### Security Headers Testing

You can test security headers using online tools:

- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)

## Production Deployment

### Required Steps

1. **Environment Variables**: Set all required production variables
2. **HTTPS**: Ensure HTTPS is enabled (enforced by HSTS)
3. **Domain Configuration**: Set correct `FRONTEND_URL`
4. **Rate Limiting**: Verify rate limits are appropriate for your traffic
5. **CSP Testing**: Test all application features work with CSP enabled

### Security Checklist

- [ ] HTTPS enabled and certificates valid
- [ ] Environment variables properly set
- [ ] CORS origins correctly configured
- [ ] Rate limits tested and appropriate
- [ ] CSP tested with all features
- [ ] Error handling tested
- [ ] Database RLS policies tested
- [ ] Authentication flow tested

## Monitoring

### Security Monitoring

- **Rate Limit Headers**: Monitor for excessive requests
- **CORS Violations**: Log and monitor origin policy violations
- **Authentication Failures**: Track failed authentication attempts
- **Error Rates**: Monitor 4xx/5xx response patterns

### Recommended Tools

- **Sentry**: Error tracking and performance monitoring
- **Supabase Dashboard**: Database and auth monitoring
- **Server Logs**: Application and security event logging

## Security Updates

### Dependencies

- Regularly update security-related packages:
  - `helmet`
  - `express-rate-limit`
  - `cors`
  - `@supabase/supabase-js`

### Vulnerability Scanning

- Run `npm audit` or `pnpm audit` regularly
- Monitor security advisories for dependencies
- Test security configuration after updates

## Contact

For security-related concerns or to report vulnerabilities, please contact the development team through appropriate channels.

---

**Note**: This security configuration provides a strong foundation but should be regularly reviewed and updated based on current security best practices and threat landscape.
