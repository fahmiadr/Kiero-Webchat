// =============================================================================
// OGG OPUS MUXER (Helper for WebCodecs Audio)
// =============================================================================

export default class OggOpusMuxer {
    constructor(sampleRate, channels, serial = Math.floor(Math.random() * 0xffffffff)) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.serial = serial;
        this.granulePos = 0;
        this.seq = 0;
        this.buffers = [];
    }

    /**
     * Create ID Header Page (First Page)
     */
    createIdHeader() {
        const head = new Uint8Array(19);
        const view = new DataView(head.buffer);

        // Magic 'OpusHead'
        head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);
        view.setUint8(8, 1); // Version
        view.setUint8(9, this.channels);
        view.setUint16(10, 0, true); // Pre-skip
        view.setUint32(12, this.sampleRate, true);
        view.setUint16(16, 0, true); // Gain
        view.setUint8(18, 0); // Mapping family

        return this.createPage(head, 2, 0); // type 2 = BOS
    }

    /**
     * Create Comment Header Page (Second Page)
     */
    createCommentHeader() {
        // Minimal comment header: Magic 'OpusTags' + Vendor String Length (0) + User Tag List Length (0)
        const magic = [0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]; // OpusTags
        const vendor = "WebCodecs";

        const len = 8 + 4 + vendor.length + 4;
        const buf = new Uint8Array(len);
        const view = new DataView(buf.buffer);

        buf.set(magic, 0);
        view.setUint32(8, vendor.length, true);
        for (let i = 0; i < vendor.length; i++) buf[12 + i] = vendor.charCodeAt(i);
        view.setUint32(12 + vendor.length, 0, true); // 0 User Tags

        return this.createPage(buf, 0, 0);
    }

    /**
     * Add Opus Encoded Chunk
     */
    addChunk(chunk, meta) {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);

        // Calculate granule position (samples)
        // Default Opus is 20ms or 48000/50 = 960 samples per frame usually
        // We use duration from meta if available, else approximate
        const duration = meta?.duration || 20000; // microseconds
        const samples = Math.round(duration * 48 / 1000); // 48kHz base

        this.granulePos += samples;
        return this.createPage(buffer, 0, this.granulePos);
    }

    /**
     * Create Final Page (EOS)
     */
    createFinalPage() {
        return this.createPage(new Uint8Array(0), 4, this.granulePos); // type 4 = EOS
    }

    /**
     * Construct an Ogg Page
     */
    createPage(payload, headerType, granulePos) {
        // Ogg Header is 27 bytes minimum
        // Lacing: 255 bytes per segment. 
        const segments = Math.ceil(payload.length / 255);
        if (segments > 255) throw new Error('Packet too large for single Ogg page'); // Simplified

        const pageLen = 27 + segments + payload.length;
        const page = new Uint8Array(pageLen);
        const view = new DataView(page.buffer);

        // Capture Pattern 'OggS'
        page.set([0x4f, 0x67, 0x67, 0x53], 0);
        view.setUint8(4, 0); // Version
        view.setUint8(5, headerType); // Header Type
        view.setBigUint64(6, BigInt(granulePos), true);
        view.setUint32(14, this.serial, true);
        view.setUint32(18, this.seq++, true);
        view.setUint32(22, 0, true); // CRC Checksum (init 0)
        view.setUint8(26, segments); // Page Segments

        // Lacing Values
        let remaining = payload.length;
        let ptr = 27;
        for (let i = 0; i < segments; i++) {
            const len = Math.min(remaining, 255);
            page[ptr++] = len;
            remaining -= len;
        }

        // Payload
        page.set(payload, ptr);

        // CRC32 Calculation
        const crc = this.crc32(page);
        view.setUint32(22, crc, true);

        return page;
    }

    crc32(buffer) {
        const table = OggOpusMuxer.crcTable || (OggOpusMuxer.crcTable = (() => {
            const t = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i << 24;
                for (let j = 0; j < 8; j++)
                    c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) : (c << 1);
                t[i] = c >>> 0;
            }
            return t;
        })());

        let crc = 0;
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc << 8) ^ table[((crc >>> 24) ^ buffer[i]) & 0xff];
            crc >>>= 0; // ensure unsigned
        }
        return crc;
    }
}
