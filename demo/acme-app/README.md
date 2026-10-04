# Acme Notes

Notes that sync everywhere. Transactional email (signup verification, password reset) is sent through the Mermail Email API.

```bash
npm start   # http://localhost:4000 (node --watch)
```

Configuration: `acme.config.json` holds non-secret settings (`appUrl`, and `sender`, the Mermail mailbox the app sends from). The Mermail API key is read only from the `MERMAIL_API_KEY` environment variable.
