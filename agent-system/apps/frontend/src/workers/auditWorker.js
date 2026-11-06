/**
 * Audit Log Worker
 * Handles heavy data processing for audit logs to keep main thread free.
 */

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'CALCULATE_HOURLY': {
            const result = calculateHourlyData(payload);
            self.postMessage({ type: 'HOURLY_RESULT', payload: result });
            break;
        }
        default:
            console.warn('Unknown worker message type:', type);
    }
};

const formatHour = (hour) => `${hour.toString().padStart(2, '0')}:00`;

function calculateHourlyData({ heatmapData, realtimeLogs, dataUpdatedAt }) {
    const now = new Date();
    const buckets = [];

    for (let i = 23; i >= 0; i--) {
        const bucketStart = new Date(now);
        bucketStart.setHours(now.getHours() - i, 0, 0, 0);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setHours(bucketEnd.getHours() + 1);
        const hour = bucketStart.getHours();

        // 1. Process API Data (Historical)
        const matchingRows = heatmapData?.filter(d => {
            // Support both formats (hour string or hour_bucket string)
            const timestamp = d.hour ? d.hour : d.hour_bucket;
            if (!timestamp) return false;
            const time = new Date(timestamp);
            return time.getHours() === hour &&
                time.getDate() === bucketStart.getDate() &&
                time.getMonth() === bucketStart.getMonth();
        }) ?? [];

        let info = 0, warn = 0, error = 0, critical = 0;
        matchingRows.forEach(row => {
            const level = (row.level || '').toUpperCase();
            const cnt = row.count ?? 0;
            switch (level) {
                case 'INFO': info += cnt; break;
                case 'WARN': case 'WARNING': warn += cnt; break;
                case 'ERROR': error += cnt; break;
                case 'CRITICAL': critical += cnt; break;
                default: info += cnt; break;
            }
        });

        const bucket = {
            hour,
            hourDate: bucketStart.toISOString(), // Send execution-agnostic strings
            hourEnd: bucketEnd.toISOString(),
            hoursAgo: i,
            label: formatHour(hour),
            count: info + warn + error + critical,
            info,
            warn,
            error,
            critical,
            isCurrent: i === 0,
            hasRealtimeUpdates: false
        };

        buckets.push(bucket);
    }

    // 2. Merge Realtime Logs
    if (realtimeLogs && realtimeLogs.length > 0 && buckets.length > 0) {
        // Only consider logs newer than what the API likely provided
        const safeThreshold = dataUpdatedAt ? (dataUpdatedAt - 2000) : 0;
        // Simple filter
        const newLogs = realtimeLogs.filter(log => new Date(log.timestamp).getTime() > safeThreshold);

        newLogs.forEach(log => {
            const logTime = new Date(log.timestamp);
            // We need to match with existing buckets which are Date objects in logic but transferred as strings?
            // Wait, we just created them as Date objects in the loop but serialized them for return.
            // But inside here, we can process them.
            // Re-parsing bucket dates for comparison efficiently?
            // Better: loop by index since buckets are sorted 23h ago -> now.
            // Or just finding the bucket.

            // Optimization: Find bucket by hoursAgo or direct time match
            // Since buckets covers last 24h, we can check basic timestamps.

            const bucket = buckets.find(b => {
                const bStart = new Date(b.hourDate);
                const bEnd = new Date(b.hourEnd);
                return logTime >= bStart && logTime < bEnd;
            });

            if (bucket) {
                bucket.count++;
                bucket.hasRealtimeUpdates = true;
                switch (log.level) {
                    case 'ERROR': bucket.error++; break;
                    case 'WARN': bucket.warn++; break;
                    case 'CRITICAL': bucket.critical++; break;
                    default: bucket.info++; break;
                }
            }
        });
    }

    return buckets;
}
