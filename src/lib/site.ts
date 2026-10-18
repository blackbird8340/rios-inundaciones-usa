export const siteName = () => process.env.SITE_NAME || 'Current Floods';
export const siteOrigin = (fallback: string) => (process.env.SITE_DOMAIN ? `https://${process.env.SITE_DOMAIN}` : fallback);
