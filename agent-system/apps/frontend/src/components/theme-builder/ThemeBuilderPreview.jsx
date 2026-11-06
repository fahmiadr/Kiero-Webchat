import React, { memo, forwardRef } from 'react';

const ThemeBuilderPreview = memo(forwardRef(({ clientId, onLoad }, ref) => {
    return (
        <div className="flex-1 bg-slate-100 flex relative right-panel-preview items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-10 overflow-hidden pointer-events-auto flex items-center justify-center">
                <iframe
                    ref={ref}
                    {...(import.meta.env.DEV
                        ? {
                            src: `${import.meta.env.VITE_WIDGET_FRONTEND_URL || 'http://localhost:5173'}/?clientId=${clientId}&preview=true`
                        }
                        : {
                            srcdoc: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body>
<script src="${import.meta.env.VITE_WIDGET_FRONTEND_URL}/embed.iife.js" data-client-id="${clientId}" data-preview="true"></script>
</body>
</html>`
                        }
                    )}
                    className="w-full h-full border-0 bg-transparent"
                    title="Widget Preview"
                    onLoad={onLoad}
                />
            </div>
        </div>
    );
}));

export default ThemeBuilderPreview;
