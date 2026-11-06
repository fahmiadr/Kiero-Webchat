/**
 * Video Compression Web Worker (Hardware Pipeline)
 * 
 * Pipeline:
 * File -> MP4Box (Demux) -> VideoDecoder (Decode) -> OffscreenCanvas (Resize) -> VideoEncoder (Encode) -> WebMMuxer (Mux)
 */

// import * as MP4BoxModule from 'mp4box';
import WebMMuxer from '../services/WebMMuxer';

// Handle ESM/CJS interop for MP4Box
const MP4Box = MP4BoxModule.default || MP4BoxModule;

self.postMessage({ type: 'LOG', message: 'Worker Script Loaded' });
self.postMessage({ type: 'LOG', message: `MP4Box Type: ${typeof MP4Box}` });

let decoder = null;
let encoder = null;
let muxer = null;
let canvas = null;
let ctx = null;
let mp4boxFile = null;

let targetWidth = 0;
let targetHeight = 0;
let totalSamples = 0;
let samplesProcessed = 0;
let samplesSent = 0;
let pendingFrames = 0;
let videoTimescale = 0;
let decodingQueue = [];
let isExtractionFinished = false;

self.onmessage = async (e) => {
    const { type, data } = e.data;

    try {
        if (type === 'START') {
            await startPipeline(data);
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', error: error.message || error });
    }
};

async function startPipeline({ file, config }) {
    log('Pipeline started');
    const { width, height, bitrate, videoCodec, audioCodec } = config;
    targetWidth = width;
    targetHeight = height;

    try {
        if (!MP4Box) throw new Error('MP4Box library not loaded');
        log('MP4Box library loaded');

        // 1. Initialize Muxer (WebM)
        muxer = new WebMMuxer({
            width: targetWidth,
            height: targetHeight,
            videoCodec: videoCodec.codec,
            audioCodec: null // Audio handled later/separately or multiplexed here if we add audio support
        });
        log('Muxer initialized');

        // 2. Initialize Encoder
        encoder = new VideoEncoder({
            output: (chunk, meta) => {
                muxer.addVideoChunk(chunk, meta);
            },
            error: (e) => {
                self.postMessage({ type: 'ERROR', error: `Encoder: ${e.message}` });
            }
        });

        const configObj = {
            codec: videoCodec.codec,
            width: targetWidth,
            height: targetHeight,
            bitrate: bitrate || 2_500_000,
            framerate: 30,
            hardwareAcceleration: videoCodec.hwAccel ? 'prefer-hardware' : 'prefer-software',
            latencyMode: 'quality'
        };
        log(`Configuring Encoder: ${JSON.stringify(configObj)}`);
        encoder.configure(configObj);
        log('Encoder configured');

        // 3. Initialize Decoder
        decoder = new VideoDecoder({
            output: (frame) => {
                pendingFrames++;
                processDecodedFrame(frame).finally(() => {
                    pendingFrames--;
                });
            },
            error: (e) => {
                self.postMessage({ type: 'ERROR', error: `Decoder: ${e.message}` });
            }
        });
        log('Decoder initialized');

        // 4. Initialize MP4Box (Demuxer)
        mp4boxFile = MP4Box.createFile();

        mp4boxFile.onError = (e) => {
            self.postMessage({ type: 'ERROR', error: `MP4Box Error: ${e}` });
        };

        mp4boxFile.onReady = (info) => {
            log('MP4Box Ready');
            try {
                const videoTrack = info.videoTracks[0];
                if (!videoTrack) {
                    throw new Error('No video track found');
                }
                log(`Video Track Found: ${videoTrack.id} (${videoTrack.codec})`);

                totalSamples = videoTrack.nb_samples;
                const timescale = videoTrack.timescale;
                log(`Total Samples: ${totalSamples}, Timescale: ${timescale}`);
                videoTimescale = timescale;

                // Retrieve the full TRAK box to access the codec configuration (AVCC, etc.)
                // info.videoTracks[0] is just a summary object. We need the internal box structure.
                const trak = mp4boxFile.moov.traks.find(t => t.tkhd.track_id === videoTrack.id);
                if (!trak) {
                    throw new Error(`TRAK box not found for ID: ${videoTrack.id}`);
                }

                // Configure Decoder
                const description = getTrackDescription(trak);

                const configObj = {
                    codec: videoTrack.codec,
                    codedWidth: videoTrack.video.width,
                    codedHeight: videoTrack.video.height,
                    description: description
                };
                log(`Configuring Decoder: ${JSON.stringify({ ...configObj, description: description ? `ArrayBuffer(${description.byteLength})` : 'null' })}`);

                decoder.configure(configObj);
                log('Decoder Configured');

                mp4boxFile.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 1000 });
                mp4boxFile.start();
                log('Extraction Started');
                processDecodingQueue();
            } catch (err) {
                self.postMessage({ type: 'ERROR', error: `onReady Error: ${err.message}` });
            }
        };

        mp4boxFile.onSamples = (track_id, user, samples) => {
            log(`Received ${samples.length} samples. Queue size: ${decodingQueue.length}`);
            for (const sample of samples) {
                decodingQueue.push(sample);
            }
            processDecodingQueue();
        };

        // 5. Read File & Feed MP4Box
        // We read the file as an ArrayBuffer
        log('Reading File Buffer...');
        const buffer = await file.arrayBuffer();
        log(`Buffer Read: ${buffer.byteLength} bytes`);
        // MP4Box requires data to be appended as ArrayBuffer with offset 0
        // Actually, create an ArrayBuffer from Blob and append.
        // MP4Box.js appendBuffer expects (data) -> it manages offset internally if we passed the whole file?
        // Proper usage: file.appendBuffer(data)

        // To treat it as arraybuffer
        // mp4boxFile.appendBuffer(buffer);
        // But buffer needs to have 'fileStart' property if we chunk it, 
        // or we can just pass the whole buffer if it fits in memory (which it should for <100MB inputs)

        // IMPORTANT: buffer must be an ArrayBuffer with the property 'fileStart' set to 0
        buffer.fileStart = 0;
        mp4boxFile.appendBuffer(buffer);
        mp4boxFile.flush();
        log('Buffer Appended to MP4Box');

        // Wait for pipeline to finish?
        // Decoder output is consistent. We need to detect when decoding is done.
        // VideoDecoder.flush() needs to be called after all chunks are submitted.
        // mp4boxFile triggers onSamples... does it trigger onComplete?
        // There is no explicit onComplete for extraction in standard usage, 
        // but since we provided all data, onSamples will run synchronously-ish (or fast).

        // We need to know when all samples are pushed to decoder to call decoder.flush()

    } catch (err) {
        self.postMessage({ type: 'ERROR', error: `Pipeline Start Error: ${err.message}` });
    }
}

function log(msg) {
    self.postMessage({ type: 'LOG', message: msg });
}

async function processDecodedFrame(frame) {
    try {
        // Log throttle: Only log every 60 frames (~2 seconds at 30fps) to prevent console flood/crash
        if (samplesProcessed % 60 === 0) {
            log(`Frame Decoded: ${frame.timestamp}`);
        }

        // 1. Resize logic using OffscreenCanvas
        if (!canvas) {
            canvas = new OffscreenCanvas(targetWidth, targetHeight);
            ctx = canvas.getContext('2d');
        }

        ctx.drawImage(frame, 0, 0, targetWidth, targetHeight);

        // 2. Create new VideoFrame from canvas
        // We inherit timestamp from source frame to maintain sync
        const newFrame = new VideoFrame(canvas, {
            timestamp: frame.timestamp,
            duration: frame.duration
        });

        // 3. Encode
        // Keyframe logic: Let encoder decide or force periodic?
        // WebCodecs encoder usually smart enough, or we can force keyframe if we tracked it
        // But simplified: allow encoder decision (latencyMode: quality).

        // Ideally we want 1 keyframe every 2s. 
        // const isKeyFrame = (samplesProcessed % 60) === 0;
        // encoder.encode(newFrame, { keyFrame: isKeyFrame });

        // Let's rely on internal config by default, or force keyframe if needed.
        // For now, let's just encode.
        // Note: We need to handle pending encodes.

        encoder.encode(newFrame);
        newFrame.close();
        frame.close(); // Close source frame

        samplesProcessed++;
        const progress = Math.round((samplesProcessed / totalSamples) * 100);
        // Throttle progress updates
        if (samplesProcessed % 10 === 0 || samplesProcessed === totalSamples) {
            self.postMessage({ type: 'PROGRESS', progress });
        }
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: `Processing Error: ${err.message}` });
        frame.close(); // Ensure cleanup
    }
}

// Helper to extract AVCC/HVCC config description for decoder
function getTrackDescription(track) {
    const entry = track.mdia.minf.stbl.stsd.entries[0];
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
        const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
        box.write(stream);
        // Remove 8 bytes header (box size + type) to get just the record
        return new Uint8Array(stream.buffer.slice(8));
    }
    return null;
}

async function processDecodingQueue() {
    if (!decoder || decoder.state === 'closed') return;

    // Safety limit for decoder queue (Chrome limit is around 100, we keep it safer at 32)
    const MAX_DECODE_QUEUE = 32;

    try {
        // Feed decoder as long as we have samples AND decoder queue is not full
        while (decodingQueue.length > 0 && decoder.decodeQueueSize < MAX_DECODE_QUEUE) {
            const sample = decodingQueue.shift();

            const type = sample.is_sync ? 'key' : 'delta';
            const timestampUs = (sample.cts * 1_000_000) / videoTimescale;
            const durationUs = (sample.duration * 1_000_000) / videoTimescale;

            const chunk = new EncodedVideoChunk({
                type: type,
                timestamp: timestampUs,
                duration: durationUs,
                data: sample.data
            });

            decoder.decode(chunk);
            samplesSent++;
        }

        // Completion Check
        if (decodingQueue.length === 0 && samplesSent >= totalSamples) {
            if (!isExtractionFinished) {
                isExtractionFinished = true;
                log('All samples submitted. Flushing Decoder...');

                decoder.flush().then(() => {
                    log('Decoder flushed. Waiting for pending frames...');
                    const checkInterval = setInterval(async () => {
                        if (pendingFrames === 0) {
                            clearInterval(checkInterval);
                            log('All frames processed. Flushing Encoder...');
                            try {
                                await encoder.flush();
                                log('Encoder flushed');
                                const blob = muxer.finalize();
                                self.postMessage({ type: 'COMPLETE', blob, size: blob.size });
                            } catch (err) {
                                self.postMessage({ type: 'ERROR', error: `Finalize Error: ${err.message}` });
                            }
                        }
                    }, 50);
                });
            }
        } else {
            // Keep checking if queue still has items or waiting for drain
            if (decodingQueue.length > 0 || samplesSent < totalSamples) {
                setTimeout(processDecodingQueue, 10);
            }
        }
    } catch (err) {
        self.postMessage({ type: 'ERROR', error: `Decoding Queue Error: ${err.message}` });
    }
}
