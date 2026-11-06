import * as React from "react"

/**
 * CircularProgress - Custom circular progress indicator
 * 
 * Note: This is a custom component, NOT from shadcn/ui registry
 * (shadcn/ui doesn't have a built-in circular progress)
 * 
 * @param {number} percentage - Progress percentage (0-100)
 * @param {number} size - Diameter of the circle in pixels (default: 32)
 * @param {number} strokeWidth - Width of the progress stroke (default: 3)
 * @param {string} color - Color of the progress stroke (default: 'white')
 * @param {string} trackColor - Color of the background track
 */
const CircularProgress = React.memo(function CircularProgress({
    percentage = 0,
    size = 32,
    strokeWidth = 3,
    color = 'white',
    trackColor = 'rgba(255,255,255,0.3)',
}) {
    // Use size directly for viewBox to ensure circle fills the container
    // Radius is calculated to leave room for stroke
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            style={{ display: 'block' }}
        >
            {/* Background track */}
            <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={trackColor}
                strokeWidth={strokeWidth}
            />
            {/* Progress arc */}
            <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-150"
            />
        </svg>
    );
});

CircularProgress.displayName = "CircularProgress";

export { CircularProgress }
