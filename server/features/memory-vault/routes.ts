import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';

const router = Router();
const databasePath = path.join(__dirname, 'database.bin');
const wasmPath = path.join(__dirname, 'qsag_matcher.wasm');

// --- Qdrant Client Setup ---
// Qdrant is the standard long-term fallback. We configure it with default local URL.
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY
});

// --- WASM & Cache State ---
let wasmInstance: any = null;
let dbFd: number | null = null;
let recordCount = 0;
let vectorIndexBuffer: Buffer | null = null; // Contiguous buffer of [UUID: 16b][Packed Vector: 48b]
let textOffsets: Int32Array | null = null;   // Array of [fileOffset, textLength]

// Precomputed 256-byte Lookup Table (LUT) as a JS fallback in case WASM compilation is pending
const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let count = 0;
  let temp = i;
  while (temp > 0) {
    if (temp & 1) count++;
    temp >>= 1;
  }
  POPCOUNT_TABLE[i] = count;
}

// WebAssembly Memory & Table imports for freestanding Zig WASM
const wasmMemory = new WebAssembly.Memory({ initial: 10, maximum: 100 }); // 640KB - 6.4MB
const wasmTable = new WebAssembly.Table({ initial: 2, element: 'anyfunc' });

// Initialize WebAssembly engine
async function initWasm() {
  if (wasmInstance) return;
  if (!fs.existsSync(wasmPath)) {
    console.log('[Memory Vault] qsag_matcher.wasm not found. Local search will fallback to JS LUT.');
    return;
  }

  try {
    const wasmBuffer = fs.readFileSync(wasmPath);
    
    // Provide the required imports for dynamic freestanding Zig build
    const importObject = {
      env: {
        memory: wasmMemory,
        __indirect_function_table: wasmTable,
        __memory_base: 0,
        __table_base: 0
      }
    };
    
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, importObject);
    wasmInstance = wasmModule.instance;
    console.log('[Memory Vault] WebAssembly Zig POPCNT matcher initialized successfully.');
  } catch (err) {
    console.error('[Memory Vault] Failed to load WebAssembly binary:', err);
  }
}

// Closes file descriptor and resets cache views
function clearCache() {
  if (dbFd !== null) {
    try {
      fs.closeSync(dbFd);
    } catch (e) {}
    dbFd = null;
  }
  recordCount = 0;
  vectorIndexBuffer = null;
  textOffsets = null;
}

// Parses database.bin to build the contiguous cached index
export function initializeCache() {
  clearCache();
  if (!fs.existsSync(databasePath)) {
    console.log('[Memory Vault] database.bin not found. Memory cache is empty.');
    return;
  }

  try {
    dbFd = fs.openSync(databasePath, 'r');
    const fileBuffer = fs.readFileSync(databasePath);
    
    // First pass: Calculate record count
    let offset = 0;
    const headerSize = 16 + 48 + 4; // UUID (16) + Packed Vector (48) + Text Length (4)
    let count = 0;
    
    while (offset + headerSize <= fileBuffer.length) {
      offset += 16 + 48; // Skip UUID and Packed Vector
      const textLen = fileBuffer.readUInt32LE(offset);
      offset += 4 + textLen;
      count++;
    }

    if (count === 0) return;

    recordCount = count;
    vectorIndexBuffer = Buffer.alloc(count * 64);
    textOffsets = new Int32Array(count * 2);

    // Second pass: Populate contiguous structures
    offset = 0;
    let recordIdx = 0;
    while (offset + headerSize <= fileBuffer.length && recordIdx < count) {
      const currentRecordStart = offset;
      
      // Copy [UUID: 16b] + [Vector: 48b] (64 bytes)
      fileBuffer.copy(vectorIndexBuffer, recordIdx * 64, offset, offset + 64);
      offset += 64;

      // Extract text length
      const textLen = fileBuffer.readUInt32LE(offset);
      offset += 4;

      // Store text start offset and length
      textOffsets[recordIdx * 2] = currentRecordStart + 68;
      textOffsets[recordIdx * 2 + 1] = textLen;

      offset += textLen;
      recordIdx++;
    }

    console.log(`[Memory Vault] Contiguous vector cache initialized with ${count} record(s).`);
  } catch (err) {
    console.error('[Memory Vault] Failed to initialize database cache:', err);
    clearCache();
  }
}

// Quantizes a 384d float vector to 48-byte packed Buffer
function quantizeFloatVector(vector: number[]): Buffer {
  const packed = Buffer.alloc(48);
  let currentByte = 0;
  for (let i = 0; i < vector.length; i++) {
    const bitIdx = i % 8;
    if (vector[i] >= 0.0) {
      currentByte |= 1 << (7 - bitIdx);
    }
    if (bitIdx === 7 || i === vector.length - 1) {
      packed[i >> 3] = currentByte;
      currentByte = 0;
    }
  }
  return packed;
}

// Local JS POPCNT Matcher fallback
function searchLocalJS(queryPacked: Buffer, topK: number) {
  if (!vectorIndexBuffer || recordCount === 0 || dbFd === null || !textOffsets) {
    return { results: [] as any[], duration_us: 0 };
  }

  const t0 = performance.now();
  const distances = new Int32Array(recordCount);

  for (let i = 0; i < recordCount; i++) {
    const baseOffset = i * 64 + 16;
    let distance = 0;
    for (let j = 0; j < 48; j++) {
      distance += POPCOUNT_TABLE[queryPacked[j] ^ vectorIndexBuffer[baseOffset + j]];
    }
    distances[i] = distance;
  }

  // Sort indices by distance
  const indices = Array.from({ length: recordCount }, (_, i) => i);
  indices.sort((a, b) => distances[a] - distances[b]);

  const results = fetchTopTexts(indices.slice(0, topK), distances);
  const durationUs = (performance.now() - t0) * 1000.0;
  return { results, duration_us: durationUs };
}

// Local WASM POPCNT Matcher
function searchLocalWasm(queryPacked: Buffer, topK: number) {
  if (!wasmInstance || !vectorIndexBuffer || recordCount === 0 || dbFd === null || !textOffsets) {
    // Fallback to JS if WASM is not loaded
    return searchLocalJS(queryPacked, topK);
  }

  const t0 = performance.now();

  // WASM Linear Memory layout allocation offsets:
  // 0 -> Query Vector (48 bytes)
  // 64 -> Output Distances (recordCount * 4 bytes)
  // Base DB Buffer Offset: Aligned at 64-byte boundary
  const queryOffset = 0;
  const outOffset = 64;
  const dbOffset = outOffset + recordCount * 4 + (64 - ((outOffset + recordCount * 4) % 64));
  
  const totalMemoryNeeded = dbOffset + vectorIndexBuffer.length;
  
  // Dynamic WebAssembly memory growth check
  const currentPages = wasmMemory.buffer.byteLength / 65536;
  const neededPages = Math.ceil(totalMemoryNeeded / 65536);
  if (neededPages > currentPages) {
    wasmMemory.grow(neededPages - currentPages);
  }

  // Write query vector and database buffer into WASM memory
  const wasmMemoryView = new Uint8Array(wasmMemory.buffer);
  wasmMemoryView.set(queryPacked, queryOffset);
  wasmMemoryView.set(vectorIndexBuffer, dbOffset);

  // Invoke the compiled Zig scanDatabase function
  wasmInstance.exports.scanDatabase(queryOffset, dbOffset, recordCount, outOffset);

  // Read distances from WASM output
  const distanceView = new Uint32Array(wasmMemory.buffer, outOffset, recordCount);
  const distances = new Int32Array(distanceView);

  // Sort indices
  const indices = Array.from({ length: recordCount }, (_, i) => i);
  indices.sort((a, b) => distances[a] - distances[b]);

  const results = fetchTopTexts(indices.slice(0, topK), distances);
  const durationUs = (performance.now() - t0) * 1000.0;
  return { results, duration_us: durationUs };
}

// Helper to retrieve text payloads from database file for top-matching indexes
function fetchTopTexts(topIndices: number[], distances: Int32Array) {
  const results: any[] = [];
  if (dbFd === null || !textOffsets || !vectorIndexBuffer) return [];

  for (let i = 0; i < topIndices.length; i++) {
    const idx = topIndices[i];
    const fileOffset = textOffsets[idx * 2];
    const textLen = textOffsets[idx * 2 + 1];

    // Extract UUID from in-memory cache
    const uuidBuf = vectorIndexBuffer.subarray(idx * 64, idx * 64 + 16);
    const id = uuidBuf.toString('hex');

    let text = '';
    if (textLen > 0) {
      const textBuf = Buffer.alloc(textLen);
      fs.readSync(dbFd, textBuf, 0, textLen, fileOffset);
      text = textBuf.toString('utf8');
    }

    const dist = distances[idx];
    const bitSimilarity = (1.0 - (dist / 384.0)) * 100;

    results.push({
      id,
      hamming_distance: dist,
      bit_density: Math.round(bitSimilarity * 100) / 100,
      chunkIndex: idx,
      text
    });
  }
  return results;
}

// Initialize startup cache and WebAssembly
initWasm().then(() => initializeCache());

// --- ROUTES ---

// Ingest a new log and append to local binary database
router.post('/ingest', async (req: Request, res: Response) => {
  const { id, vector, text } = req.body;
  
  if (!id || !vector || !Array.isArray(vector) || !text) {
    return res.status(400).json({ error: 'id, vector (array), and text are required.' });
  }

  try {
    const packedVector = quantizeFloatVector(vector);
    const uuidBuf = Buffer.from(id.replace(/-/g, ''), 'hex');
    const textBuf = Buffer.from(text, 'utf8');
    const textLenBuf = Buffer.alloc(4);
    textLenBuf.writeUInt32LE(textBuf.length, 0);

    // Write directly to file
    const record = Buffer.concat([uuidBuf, packedVector, textLenBuf, textBuf]);
    fs.appendFileSync(databasePath, record);

    // Re-index cache to include new record
    initializeCache();

    return res.json({
      success: true,
      message: 'Log record compressed & stored locally.',
      record_size: record.length
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Search locally using Zig WASM or fall back to Qdrant if no match
router.post('/query', async (req: Request, res: Response) => {
  const { floatVector, topK, queryText } = req.body;

  if (!floatVector || !Array.isArray(floatVector)) {
    return res.status(400).json({ error: 'floatVector (array) is required.' });
  }

  const k = topK || 5;

  try {
    const queryPacked = quantizeFloatVector(floatVector);
    
    // 1. Scan Local Binary DB using Zig WebAssembly
    let searchResult;
    if (wasmInstance) {
      searchResult = searchLocalWasm(queryPacked, k);
    } else {
      searchResult = searchLocalJS(queryPacked, k);
    }

    const { results, duration_us } = searchResult;
    
    // Check if the best match has high similarity (> 87.5% similarity is ~48 bits difference or less out of 384)
    const bestMatch = results[0];
    const SIMILARITY_THRESHOLD = 87.5;
    
    if (bestMatch && bestMatch.bit_density >= SIMILARITY_THRESHOLD) {
      console.log(`[Memory Vault] Local QSAG Match Hit: ${bestMatch.bit_density}% similarity. Executing Local Triage.`);
      return res.json({
        source: 'QSAG_WASM_CACHE',
        duration_us,
        results
      });
    }

    // 2. Fallback Path: Query Qdrant Cloud/Local Database
    console.log(`[Memory Vault] Local Cache Miss (Similarity: ${bestMatch ? bestMatch.bit_density : 0}%). Querying Qdrant...`);
    
    try {
      const t0 = performance.now();
      const qdrantResults = await qdrantClient.search('incident_runbooks', {
        vector: floatVector,
        limit: k
      });
      const qdrantDurationUs = (performance.now() - t0) * 1000.0;

      // Convert Qdrant payload formats to match local schema
      const formattedQdrantResults = qdrantResults.map((r, idx) => ({
        id: r.id.toString(),
        hamming_distance: -1, // Not applicable for float RAG
        bit_density: Math.round(r.score * 10000) / 100, // percentage representation
        chunkIndex: idx,
        text: (r.payload?.text as string) || ''
      }));

      return res.json({
        source: 'QDRANT_FALLBACK',
        duration_us: qdrantDurationUs,
        results: formattedQdrantResults
      });
    } catch (qdrantErr: any) {
      console.warn(`[Memory Vault] Qdrant search failed: ${qdrantErr.message}. Falling back to local match.`);
      return res.json({
        source: 'QSAG_WASM_CACHE',
        duration_us,
        results
      });
    }

  } catch (err: any) {
    console.error('[Memory Vault Query Error]', err);
    return res.status(500).json({ error: `Memory query failed: ${err.message}` });
  }
});

export default router;
