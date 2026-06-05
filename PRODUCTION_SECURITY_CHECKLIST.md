# Production Security Checklist — Intelligence Exchange

## Critical Pre-Deployment Requirements 🔴

### Infrastructure Security

- [ ] **Generate SSL certificates** for production
  - Use certificates from trusted CA (Let's Encrypt, DigiCert, etc.)
  - Do NOT use self-signed certificates in production
  - Run: `./scripts/generate-dev-ssl.sh` for development only
  - For production: Obtain proper CA certificates

- [ ] **Use SSL-enabled docker-compose**
  - Development: `docker-compose.yml`
  - Production: `docker-compose.ssl.yml`
  - Command: `docker-compose -f docker-compose.ssl.yml up -d`

- [ ] **Set strong passwords** (minimum 32 characters)
  ```bash
  # Generate secure passwords
  export POSTGRES_PASSWORD=$(openssl rand -base64 32)
  export REDIS_PASSWORD=$(openssl rand -base64 32)
  ```

- [ ] **Set BROKER_ATTESTOR_PRIVATE_KEY**
  - Generate new key: `openssl rand -hex 32`
  - Never use Anvil dev keys in production
  - Store securely in secrets manager

- [ ] **Set ADMIN_API_KEY** (minimum 32 characters)
  - Generate: `openssl rand -base64 32`
  - Required for admin endpoints
  - Store securely in secrets manager

### Application Security

- [ ] **Set WORLD_ID_STRICT=true (OPTIONAL)**
  - Optional: World ID is an optional dependency
  - Set to true only if you want to require World ID verification
  - System works correctly without World ID verification

- [ ] **Set proper CORS origins**
  - Whitelist your production domains only
  - Example: `CORS_ALLOWED_ORIGINS=https://yourdomain.com`
  - Never use wildcard (*) in production

- [ ] **Enable all required integrations**
  - Set proper RPC URLs for production chains
  - Configure proper contract addresses
  - Set proper World ID environment (production vs staging)

### Dependency Security

- [ ] **Update dependencies** to apply security patches
  ```bash
  pnpm install
  # This will apply the ws@^8.20.1 and uuid@^11.1.1 overrides
  ```

- [ ] **Verify no vulnerabilities remain**
  ```bash
  pnpm audit
  # Should show no vulnerabilities after overrides
  ```

### Network Security

- [ ] **Configure firewall rules**
  - Only allow necessary ports (80, 443 for web)
  - Block direct database access from internet
  - Use VPN for admin access

- [ ] **Enable DDoS protection**
  - Cloudflare, AWS Shield, or similar
  - Rate limiting at edge
  - Geographic blocking if needed

### Secrets Management

- [ ] **Use secrets manager** (never commit secrets)
  - AWS Secrets Manager
  - HashiCorp Vault
  - Google Secret Manager
  - Azure Key Vault

- [ ] **Enable secret rotation**
  - Database passwords: rotate every 90 days
  - API keys: rotate every 60 days
  - Private keys: rotate annually or upon compromise

- [ ] **Audit secret access**
  - Enable logging for all secret access
  - Review access logs regularly
  - Alert on suspicious access patterns

## Post-Deployment Monitoring

### Security Monitoring

- [ ] **Enable security logging**
  - Failed authentication attempts
  - Admin endpoint access
  - Database connection failures
  - Unusual API usage patterns

- [ ] **Set up alerts for**
  - Brute force attacks
  - Unusual data access patterns
  - Database connection failures
  - High error rates
  - Memory/CPU spikes

### Performance Monitoring

- [ ] **Monitor resource usage**
  - CPU, memory, disk usage
  - Database connection pool
  - Redis memory usage
  - API response times

- [ ] **Set up health checks**
  - `/health` endpoint monitoring
  - Database connectivity
  - Redis connectivity
  - External service availability

## Compliance & Auditing

### Data Protection

- [ ] **Enable encryption at rest** (database backups)
- [ ] **Enable encryption in transit** (SSL/TLS)
- [ ] **Implement data retention policies**
- [ ] **Set up regular backups**
- [ ] **Test backup restoration**

### Access Control

- [ ] **Implement principle of least privilege**
- [ ] **Use role-based access control (RBAC)**
- [ ] **Enable multi-factor authentication (MFA)**
- [ ] **Regular access reviews**
- [ ] **Disable inactive accounts**

## Incident Response

### Prepare Incident Response Plan

- [ ] **Document incident response procedures**
- [ ] **Set up emergency communication channels**
- [ ] **Identify key responders and their roles**
- [ ] **Prepare rollback procedures**
- [ ] **Test incident response regularly**

### Security Incident Response

If security incident occurs:
1. **Isolate affected systems**
2. **Preserve evidence (logs, metrics)**
3. **Notify stakeholders**
4. **Investigate root cause**
5. **Implement fixes**
6. **Test and deploy patches**
7. **Conduct post-incident review**
8. **Update security procedures**

## Regular Security Tasks

### Daily
- [ ] Review security logs
- [ ] Check for failed authentication attempts
- [ ] Monitor resource usage

### Weekly
- [ ] Review dependency updates
- [ ] Check for new CVEs
- [ ] Review access logs

### Monthly
- [ ] Rotate API keys and secrets
- [ ] Review and update security documentation
- [ ] Conduct security awareness training
- [ ] Test backup restoration

### Quarterly
- [ ] Conduct full security audit
- [ ] Penetration testing
- [ ] Review and update incident response plan
- [ ] Security training for team

## Security Best Practices

### Development
- Never commit secrets or API keys
- Use environment-specific configurations
- Implement security in CI/CD pipeline
- Code review for security issues

### Deployment
- Use separate environments (dev, staging, prod)
- Implement blue-green deployments
- Test security fixes in staging first
- Rollback plan for every deployment

### Operations
- Principle of least privilege
- Defense in depth
- Regular security updates
- Monitoring and alerting
- Incident response preparedness

## Emergency Contacts

- **Security Team**: [contact info]
- **DevOps Team**: [contact info]
- **Management**: [contact info]
- **Legal/Compliance**: [contact info]

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

## Sign-off

**Deployment Authorization:**
- [ ] Security team approval
- [ ] DevOps team approval
- [ ] Management approval

**Date:** _______________
**Authorized By:** _______________
**Role:** _______________