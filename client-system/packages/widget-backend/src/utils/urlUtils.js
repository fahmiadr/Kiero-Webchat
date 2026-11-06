/**
 * URL Utilities for Widget Backend
 */

/**
 * Rewrites attachment URLs from Agent Backend format to Widget Proxy format.
 * 
 * Agent Backend: /api/upload/download/{type}/{filename}
 * Widget Proxy:  /api/media/proxy/{type}/{filename}
 * 
 * @param {Array} attachments - Array of attachment objects
 * @returns {Array} Array of attachments with rewritten fileUrls
 */
export function rewriteAttachmentUrls(attachments) {
    if (!attachments || !Array.isArray(attachments)) return [];

    return attachments.map(att => {
        // Pattern: /api/upload/download/{type}/{filename}
        const agentUrlPattern = /\/api\/upload\/download\/([^/]+)\/([^/]+)$/;
        const match = att.fileUrl && att.fileUrl.match(agentUrlPattern);

        if (match) {
            const [, type, filename] = match;
            // Use relative path for frontend (ImageAttachment will prepend backendUrl)
            return {
                ...att,
                fileUrl: `/api/media/proxy/${type}/${filename}`
            };
        }
        return att;
    });
}
