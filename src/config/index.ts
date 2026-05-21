import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKeySecret: process.env.API_KEY_SECRET || 'default-secret',
  signedUrlSecret: process.env.SIGNED_URL_SECRET || 'default-signed-secret',
  signedUrlExpiry: parseInt(process.env.SIGNED_URL_EXPIRY || '3600', 10),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/accounts/oauth/callback',
  },
};
