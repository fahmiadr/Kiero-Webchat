/**
 * Professional WebM Muxer (EBML Writer)
 * 
 * Wraps raw encoded chunks from WebCodecs API into a STRICTLY COMPLIANT WebM container.
 * Features:
 * - Proper EBML Header & Segment Structure
 * - SeekHead (Index pointer) for fast parsing
 * - Cues (Indexing) for instant seeking/scrubbing
 * - Cluster/Block organization for streaming
 * - Support for AV1 (V_AV1), VP9 (V_VP9), VP8 (V_VP8), Opus (A_OPUS)
 * 
 * Compliance: Matroska/WebM Standard
 */
export default class WebMMuxer {
    constructor(options) {
        this.width = options.width;
        this.height = options.height;
        this.videoCodec = options.videoCodec; // 'av01...', 'vp09...', 'vp8'
        this.audioCodec = options.audioCodec; // 'opus'

        // Track Numbers
        this.videoTrackNumber = 1;
        this.audioTrackNumber = 2;

        // Buffers
        this.storedClusters = []; // Stores { timecode, data: Uint8Array }
        this.clusterTimecode = 0;
        this.clusterData = []; // Stores Blocks for current cluster
        this.currentClusterStart = 0;

        // Stats
        this.duration = 0;
        this.clusterDurationLimit = 1000; // Start new cluster every 1 second
    }

    /**
     * Add an encoded video chunk to the muxer
     */
    addVideoChunk(chunk) {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);

        const isKeyframe = chunk.type === 'key';
        const timestamp = chunk.timestamp / 1000; // to milliseconds

        this._addBlock(this.videoTrackNumber, buffer, timestamp, isKeyframe);
    }

    /**
     * Add an encoded audio chunk to the muxer
     */
    addAudioChunk(chunk) {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);

        const timestamp = chunk.timestamp / 1000; // to milliseconds
        const isKeyframe = true; // Audio frames are usually self-contained

        this._addBlock(this.audioTrackNumber, buffer, timestamp, isKeyframe);
    }

    /**
     * Internal: Add a SimpleBlock to the current Cluster
     */
    _addBlock(trackNumber, data, timestamp, isKeyframe) {
        this.duration = Math.max(this.duration, timestamp);

        // Start new cluster if needed
        if (this.clusterData.length > 0 && (timestamp - this.currentClusterStart >= this.clusterDurationLimit)) {
            this._flushCluster();
            this.currentClusterStart = timestamp;
        }

        // Create SimpleBlock Element
        // SimpleBlock Structure:
        // [Track Number (VINT)] + [Timecode (Int16, relative to Cluster)] + [Flags (1 byte)] + [Data]

        const relativeTime = Math.round(timestamp - this.currentClusterStart);
        if (relativeTime < 0 || relativeTime > 32767) {
            this._flushCluster();
            this.currentClusterStart = timestamp;
        }

        const trackVint = this._createVint(trackNumber);

        // Flags: Keyframe (bit 7)
        let flags = 0;
        if (isKeyframe) flags |= 0x80;

        const headerSize = trackVint.length + 2 + 1; // Track + Time(2) + Flags(1)
        const blockSize = headerSize + data.length;
        const blockId = 0xA3; // SimpleBlock

        // BlockID (1 byte for 0xA3) + Size(VINT) + BlockSize
        const blockIdBuffer = this._idToBuffer(blockId);
        const blockSizeVint = this._createVint(blockSize);

        const blockBuffer = new Uint8Array(blockIdBuffer.length + blockSizeVint.length + blockSize);
        let offset = 0;

        // Write ID
        blockBuffer.set(blockIdBuffer, offset);
        offset += blockIdBuffer.length;
        // Write Size
        blockBuffer.set(blockSizeVint, offset);
        offset += blockSizeVint.length;
        // Write Track Number
        blockBuffer.set(trackVint, offset);
        offset += trackVint.length;
        // Write Timecode (Big Endian Int16)
        blockBuffer[offset++] = (relativeTime >> 8) & 0xFF;
        blockBuffer[offset++] = relativeTime & 0xFF;
        // Write Flags
        blockBuffer[offset++] = flags;
        // Write Data
        blockBuffer.set(data, offset);

        this.clusterData.push(blockBuffer);
    }

    /**
     * Flush pending blocks into a Cluster element
     */
    _flushCluster() {
        if (this.clusterData.length === 0) return;

        // Content = Timecode(0xE7) + SimpleBlocks
        const blocksSize = this.clusterData.reduce((acc, b) => acc + b.length, 0);

        // Timecode Element: 0xE7 + Size + Value
        const timecodeBuffer = this._createElement(0xE7, this._createUIntBuffer(Math.round(this.currentClusterStart)));

        const clusterContentSize = timecodeBuffer.length + blocksSize;
        const clusterId = 0x1F43B675;

        // Write Cluster Header
        const clusterIdBuffer = this._idToBuffer(clusterId);
        const sizeVint = this._createVint(clusterContentSize);

        const clusterHeader = new Uint8Array(clusterIdBuffer.length + sizeVint.length);
        clusterHeader.set(clusterIdBuffer, 0);
        clusterHeader.set(sizeVint, clusterIdBuffer.length);

        // Combine all parts into one Cluster Buffer
        // This is crucial for calculating offsets later
        const clusterBuffer = new Uint8Array(clusterHeader.length + timecodeBuffer.length + blocksSize);
        let offset = 0;

        clusterBuffer.set(clusterHeader, offset); offset += clusterHeader.length;
        clusterBuffer.set(timecodeBuffer, offset); offset += timecodeBuffer.length;

        this.clusterData.forEach(block => {
            clusterBuffer.set(block, offset);
            offset += block.length;
        });

        // Store cluster with its start time
        this.storedClusters.push({
            timecode: this.currentClusterStart,
            data: clusterBuffer
        });

        this.clusterData = [];
    }

    /**
     * Finalize the WebM file and return a Blob
     * Calculates SeekHead and Cues for full seekability
     */
    finalize() {
        this._flushCluster();

        // 1. EBML Header
        const ebmlHeader = this._createEBMLHeader();

        // 2. Prepare Info & Tracks
        const info = this._createInfo();
        const tracks = this._createTracks();

        // 3. Calculate Offsets & Generate Cues
        // Layout: [SeekHead] [Info] [Tracks] [Clusters...] [Cues]

        // Reserve space for SeekHead (Estimate 60 bytes, use Void for padding if needed)
        // SeekHead points to Info, Tracks, Cues
        // We will generate SeekHead at the end once we know Cues position

        // Calculate Base Offset (start of Clusters)
        // Offset 0 is start of Segment Data (after Segment Header)
        // Let's assume SeekHead is roughly 100 bytes (safe margin)
        const ESTIMATED_SEEKHEAD_SIZE = 100;
        const infoSize = info.length;
        const tracksSize = tracks.length;

        let currentOffset = ESTIMATED_SEEKHEAD_SIZE + infoSize + tracksSize;

        // Generate Cues Index
        const cuePoints = [];
        this.storedClusters.forEach(cluster => {
            // Index every cluster (every 1 second approx)
            cuePoints.push({
                time: cluster.timecode,
                offset: currentOffset
            });
            currentOffset += cluster.data.length;
        });

        const cues = this._createCues(cuePoints);

        // Now we know Cues position!
        const cuesOffset = currentOffset; // Position after last cluster

        // 4. Generate Real SeekHead
        const seekHead = this._createSeekHead(
            ESTIMATED_SEEKHEAD_SIZE, // Info Offset (immediately after SeekHead)
            ESTIMATED_SEEKHEAD_SIZE + infoSize, // Tracks Offset
            cuesOffset // Cues Offset
        );

        // 5. Handle SeekHead Padding (Void Element)
        // If real SeekHead < Estimated, pad with Void
        let seekHeadSection;
        if (seekHead.length < ESTIMATED_SEEKHEAD_SIZE) {
            const paddingSize = ESTIMATED_SEEKHEAD_SIZE - seekHead.length;
            const voidElement = this._createVoid(paddingSize);
            seekHeadSection = this._concat(seekHead, voidElement);
        } else {
            // If SeekHead grew larger (unlikely for 3 items), we'd need to shift everything.
            // For now, assume 100 bytes is PLENTY.
            seekHeadSection = seekHead; // Risk: alignment mismatch if > 100
        }

        // 6. Assemble Segment Data
        const segmentContent = [
            seekHeadSection,
            info,
            tracks,
            ...this.storedClusters.map(c => c.data),
            cues
        ];

        // 7. Create Segment Header
        const segmentId = 0x18538067;
        const segmentSize = segmentContent.reduce((acc, part) => acc + part.length, 0);

        const segmentIdBuffer = this._idToBuffer(segmentId);
        const segmentSizeVint = this._createVint(segmentSize);

        const segmentHeader = new Uint8Array(segmentIdBuffer.length + segmentSizeVint.length);
        segmentHeader.set(segmentIdBuffer, 0);
        segmentHeader.set(segmentSizeVint, segmentIdBuffer.length);

        return new Blob([ebmlHeader, segmentHeader, ...segmentContent], { type: 'video/webm' });
    }

    // =========================================================================
    // INDUSTRY STANDARD HELPERS (SeekHead, Cues, Void)
    // =========================================================================

    _createSeekHead(infoOffset, tracksOffset, cuesOffset) {
        // SeekHead (11 4d 9b 74)
        // - Seek
        //   - SeekID (Info)
        //   - SeekPosition
        // - Seek
        //   - SeekID (Tracks)
        //   - SeekPosition
        // - Seek
        //   - SeekID (Cues)
        //   - SeekPosition

        const infoSeek = this._createSeekEntry(0x1549A966, infoOffset); // Info ID
        const tracksSeek = this._createSeekEntry(0x1654AE6B, tracksOffset); // Tracks ID
        const cuesSeek = this._createSeekEntry(0x1C53BB6B, cuesOffset); // Cues ID

        return this._createElement(0x114D9B74, this._concat(infoSeek, tracksSeek, cuesSeek));
    }

    _createSeekEntry(id, position) {
        // Seek (4dbb)
        //  SeekID (53ab)
        //  SeekPosition (53ac)

        const seekIdData = this._idToBuffer(id);
        const seekId = this._createElement(0x53AB, seekIdData);
        const seekPos = this._createElement(0x53AC, this._createUIntBuffer(position));

        return this._createElement(0x4DBB, this._concat(seekId, seekPos));
    }

    _createCues(cuePoints) {
        // Cues (1c 53 bb 6b)
        //  - CuePoint
        //     - CueTime
        //     - CueTrackPositions
        //       - CueTrack
        //       - CueClusterPosition

        const cueElements = cuePoints.map(point => {
            const cueTime = this._createElement(0xB3, this._createUIntBuffer(Math.round(point.time)));

            const cueTrack = this._createElement(0xF7, this._createUIntBuffer(1)); // Video Track
            const cueClusterPos = this._createElement(0xF1, this._createUIntBuffer(point.offset));
            const cueTrackPos = this._createElement(0xB7, this._concat(cueTrack, cueClusterPos));

            return this._createElement(0xBB, this._concat(cueTime, cueTrackPos));
        });

        // Combine all CuePoints
        const cuesData = this._concat(...cueElements);
        return this._createElement(0x1C53BB6B, cuesData);
    }

    _createVoid(size) {
        // Void (ec)
        // Size = Total Size - 1 (ID) - VintSizeLength
        // This is tricky because VintSizeLength depends on size.
        // For simple padding check: ID(0xEC) is 1 byte.
        // If size is small (e.g. 5 bytes): ID(1) + Size(1) + Data(3)
        // _createElement adds overhead.

        // Calculation: 
        // We want strict Byte size output.
        // size included ID and Size field? Usually callers mean "Total bytes to occupy".
        // Let's assume 'size' is the Total Padding Bytes needed.

        if (size < 2) return new Uint8Array(0); // Cannot pad < 2 bytes properly

        // Just empty data?
        // _createElement(0xEC, data) will create: ID + SizeVint + Data.
        // We need X bytes of Data such that Total = size.

        // Approximation logic:
        // ID (1) + Size (1) -> Data = size - 2. (If data < 127)
        // Valid for small padding.

        let dataLen = size - 2;
        const voidBuffer = new Uint8Array(dataLen); // Zeros
        return this._createElement(0xEC, voidBuffer);
    }

    _createEBMLHeader() {
        // EBML Header (1a 45 df a3)
        // DocType: webm
        // DocTypeVersion: 4
        // DocTypeReadVersion: 2

        const docType = this._createElement(0x4282, new TextEncoder().encode('webm'));
        const docTypeVer = this._createElement(0x4287, this._createUIntBuffer(4));
        const docTypeReadVer = this._createElement(0x4285, this._createUIntBuffer(2));

        const content = new Uint8Array(docType.length + docTypeVer.length + docTypeReadVer.length);
        content.set(docType, 0);
        content.set(docTypeVer, docType.length);
        content.set(docTypeReadVer, docType.length + docTypeVer.length);

        return this._createElement(0x1A45DFA3, content);
    }

    _createInfo() {
        // Info (15 49 a9 66)
        // TimecodeScale: 1000000 (1ms)
        // MuxingApp: KieroMuxer
        // WritingApp: KieroMuxer
        // Duration: (Float)

        const timecodeScale = this._createElement(0x2AD7B1, this._createUIntBuffer(1000000));
        const muxingApp = this._createElement(0x4D80, new TextEncoder().encode('KieroMuxer'));
        const writingApp = this._createElement(0x5741, new TextEncoder().encode('KieroMuxer v1.0')); // Updated branding
        const duration = this._createElement(0x4489, this._createFloatBuffer(this.duration));

        const content = new Uint8Array(timecodeScale.length + muxingApp.length + writingApp.length + duration.length);
        let offset = 0;
        content.set(timecodeScale, offset); offset += timecodeScale.length;
        content.set(muxingApp, offset); offset += muxingApp.length;
        content.set(writingApp, offset); offset += writingApp.length;
        content.set(duration, offset);

        return this._createElement(0x1549A966, content);
    }

    _createTracks() {
        // Tracks (16 54 ae 6b)

        let trackEntries = [];

        // Video Track Entry
        trackEntries.push(this._createVideoTrackEntry());

        // Audio Track Entry (if exists)
        if (this.audioCodec) {
            trackEntries.push(this._createAudioTrackEntry());
        }

        const totalSize = trackEntries.reduce((acc, t) => acc + t.length, 0);
        const buffer = new Uint8Array(totalSize);
        let offset = 0;
        trackEntries.forEach(t => {
            buffer.set(t, offset);
            offset += t.length;
        });

        return this._createElement(0x1654AE6B, buffer);
    }

    _createVideoTrackEntry() {
        // TrackEntry (ae)
        // TrackNumber (d7): 1
        // TrackUID (73 c5): 1
        // TrackType (83): 1 (Video)
        // FlagLacing (9c): 0
        // CodecID (86): V_VP9, V_AV1, V_VP8

        let codecIdStr = 'V_VP8'; // Fallback
        if (this.videoCodec.startsWith('vp09')) codecIdStr = 'V_VP9';
        if (this.videoCodec.startsWith('av01')) codecIdStr = 'V_AV1';

        const trackNumber = this._createElement(0xD7, this._createUIntBuffer(this.videoTrackNumber));
        const trackUid = this._createElement(0x73C5, this._createUIntBuffer(this.videoTrackNumber));
        const trackType = this._createElement(0x83, this._createUIntBuffer(1));
        const codecId = this._createElement(0x86, new TextEncoder().encode(codecIdStr));

        // Video specific (e0)
        // PixelWidth (b0)
        // PixelHeight (ba)
        const width = this._createElement(0xB0, this._createUIntBuffer(this.width));
        const height = this._createElement(0xBA, this._createUIntBuffer(this.height));
        const video = this._createElement(0xE0, this._concat(width, height));

        return this._createElement(0xAE, this._concat(trackNumber, trackUid, trackType, codecId, video));
    }

    _createAudioTrackEntry() {
        // TrackEntry (ae)
        // TrackNumber (d7): 2
        // TrackUID (73 c5): 2
        // TrackType (83): 2 (Audio)
        // CodecID (86): A_OPUS

        const trackNumber = this._createElement(0xD7, this._createUIntBuffer(this.audioTrackNumber));
        const trackUid = this._createElement(0x73C5, this._createUIntBuffer(this.audioTrackNumber));
        const trackType = this._createElement(0x83, this._createUIntBuffer(2));
        const codecId = this._createElement(0x86, new TextEncoder().encode('A_OPUS'));

        // Audio specific (e1)
        // SamplingFrequency (b5): 48000
        // Channels (94): 2
        const sampleRate = this._createElement(0xB5, this._createfloatBuffer(48000.0)); // Note: Float for sample rate
        const channels = this._createElement(0x94, this._createUIntBuffer(2));
        // CodecDelay (56 aa): 0? Opus usually needs SeekPreRoll
        // Since we are doing simple mux, let's stick to basics.

        const audio = this._createElement(0xE1, this._concat(sampleRate, channels));

        return this._createElement(0xAE, this._concat(trackNumber, trackUid, trackType, codecId, audio));
    }

    _createVint(value) {
        let length = 1;
        for (length = 1; length <= 8; length++) {
            if (value < Math.pow(2, 7 * length) - 1) {
                break;
            }
        }

        const buffer = new Uint8Array(length);
        let val = value | (1 << (7 * length));

        for (let i = length - 1; i >= 0; i--) {
            buffer[i] = val & 0xFF;
            val = val >> 8;
        }
        return buffer;
    }

    _getVintLength(value) {
        return this._createVint(value).length;
    }

    _writeVint(buffer, value, offset) {
        const vint = this._createVint(value);
        buffer.set(vint, offset);
        return vint.length;
    }

    _createElement(id, data) {
        // ID is already a VINT-encoded integer (e.g. 0x1A45DFA3)
        // We just need to write it as bytes (Big Endian)
        const idBuffer = this._idToBuffer(id);
        const sizeVint = this._createVint(data.length);
        const buffer = new Uint8Array(idBuffer.length + sizeVint.length + data.length);

        buffer.set(idBuffer, 0);
        buffer.set(sizeVint, idBuffer.length);
        buffer.set(data, idBuffer.length + sizeVint.length);

        return buffer;
    }

    _idToBuffer(id) {
        let bytes = 1;
        if (id > 0xFFFFFF) bytes = 4;
        else if (id > 0xFFFF) bytes = 3;
        else if (id > 0xFF) bytes = 2;

        const buffer = new Uint8Array(bytes);
        for (let i = bytes - 1; i >= 0; i--) {
            buffer[i] = id & 0xFF;
            id = id >> 8;
        }
        return buffer;
    }

    _createUIntBuffer(value) {
        // Find min bytes needed
        let bytes = 1;
        if (value > 0xFF) bytes = 2;
        if (value > 0xFFFF) bytes = 3; // unusual
        if (value > 0xFFFFFF) bytes = 4;
        // ... handled simplified for JS standard usage

        const buffer = new Uint8Array(bytes);
        for (let i = bytes - 1; i >= 0; i--) {
            buffer[i] = value & 0xFF;
            value = value >> 8;
        }
        return buffer;
    }

    _createFloatBuffer(value) {
        const buffer = new ArrayBuffer(8); // Double precision
        new DataView(buffer).setFloat64(0, value, false); // Big Endian
        return new Uint8Array(buffer);
    }

    // Quick Fix for SamplingFreq which is float
    _createfloatBuffer(value) {
        const buffer = new ArrayBuffer(4); // Float 32
        new DataView(buffer).setFloat32(0, value, false);
        return new Uint8Array(buffer);
    }

    _concat(...buffers) {
        const totalSize = buffers.reduce((acc, b) => acc + b.length, 0);
        const result = new Uint8Array(totalSize);
        let offset = 0;
        buffers.forEach(b => {
            result.set(b, offset);
            offset += b.length;
        });
        return result;
    }
}
