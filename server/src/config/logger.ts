import pino from 'pino';
export const logger = pino({redact:{paths:['req.headers.authorization','req.headers.cookie','req.body','res.headers.set-cookie','token','refreshToken','code','password'],censor:'[REDACTED]'}});
