/**
 * Audio Compression Web Worker
 *
 * Receives pre-decoded audio channel data from main thread.
 * Encodes to Opus and muxes to Ogg container.
 */

import OggOpusMuxer from '../services/OggOpusMuxer.js';

// =============================================================================
// WORKER MESSAGE HANDLER
// =============================================================================

self.onmessage = async (e) => {
  const { type, channelData, sampleRate, numberOfChannels, length, config } = e.data;

  if (type === 'START') {
    try {
      const result = await encodeAudio(channelData, sampleRate, numberOfChannels, length, config);
      self.postMessage({ type: 'COMPLETE', ...result });
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message || String(err) });
    }
  }
};

async function encodeAudio(channelData, sampleRate, numberOfChannels, totalFrames, config) {
  if (typeof AudioEncoder === 'undefined') {
    throw new Error('AudioEncoder not supported in worker');
  }

  const encoderConfig = {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: numberOfChannels,
    bitrate: config?.bitrate || 96000,
  };

  const muxer = new OggOpusMuxer(encoderConfig.sampleRate, encoderConfig.numberOfChannels);

  const idHeader = muxer.createIdHeader();
  const commentHeader = muxer.createCommentHeader();
  const chunks = [idHeader, commentHeader];

  return new Promise((resolve, reject) => {
    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        const oggPage = muxer.addChunk(chunk, meta);
        chunks.push(oggPage);
      },
      error: (e) => reject(e),
    });

    encoder.configure(encoderConfig);

    const frameSize = 48000; // 1 second chunks
    let processed = 0;

    const processLoop = () => {
      if (processed >= totalFrames) {
        encoder
          .flush()
          .then(() => {
            chunks.push(muxer.createFinalPage());
            const blob = new Blob(chunks, { type: 'audio/ogg' });
            resolve({
              success: true,
              blob,
              extension: 'ogg',
              mimeType: 'audio/ogg',
            });
          })
          .catch(reject);
        return;
      }

      const length = Math.min(frameSize, totalFrames - processed);
      const planeData = new Float32Array(length * numberOfChannels);

      // Interleave channel data for f32-planar format
      for (let ch = 0; ch < numberOfChannels; ch++) {
        const segment = channelData[ch].subarray(processed, processed + length);
        planeData.set(segment, ch * length);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: sampleRate,
        numberOfFrames: length,
        numberOfChannels: numberOfChannels,
        timestamp: (processed * 1000000) / sampleRate,
        data: planeData,
      });

      encoder.encode(audioData);
      audioData.close();

      processed += length;
      const progress = Math.round((processed / totalFrames) * 90);
      self.postMessage({ type: 'PROGRESS', progress });

      setTimeout(processLoop, 0);
    };

    processLoop();
  });
}
