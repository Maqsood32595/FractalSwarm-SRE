# Standalone Zig-WebAssembly Log Deduplicator

This folder contains the high-performance core bitwise POPCNT filtering engine used in FractalSwarm SRE. It is written in Zig and compiled to freestanding WebAssembly (WASM) to enable extremely fast, low-latency log clustering on any JavaScript runtime (Node.js, Deno, Bun, or Cloudflare Edge Workers).

---

## 📂 Contents
* `qsag_matcher.zig`: The Zig source code running the XOR-POPCNT loop.
* `qsag_matcher.wasm`: The compiled freestanding WebAssembly module (under 5KB).

---

## 💡 How It Works
Instead of feeding raw, repetitive server logs directly to LLMs—which wastes thousands of dollars in tokens and causes API rate-limits—this module pre-filters them. 

1. Raw text alerts are hashed/mapped into binary signature vectors (e.g. 48-byte packed bit arrays).
2. The Zig-WASM loop calculates the **Hamming Distance** using bitwise XOR and the native `@popCount` instruction.
3. It clusters logs in **microseconds**, returning similarity scores so only unique, high-entropy logs are forwarded to the agent swarm.

---

## 🚀 How to Run Standalone in Node.js

Here is a simple example showing how to load and execute the WASM module in Node.js:

```javascript
const fs = require('fs');
const path = require('path');

async function runDeduplicator() {
  // 1. Load the WebAssembly binary
  const wasmBuffer = fs.readFileSync(path.join(__dirname, 'qsag_matcher.wasm'));
  const { instance } = await WebAssembly.instantiate(wasmBuffer);
  const exports = instance.exports;

  // 2. Allocate memory buffers in WASM Linear Memory
  const querySize = 48; // 48-byte packed vector
  const recordCount = 1000;
  const dbSize = recordCount * 64; // Each record is 64 bytes (16b ID + 48b vector)
  
  // Total memory page size (64KB chunks)
  const memory = exports.memory;
  
  // Create views onto the WASM memory buffer
  const queryOffset = 0;
  const dbOffset = querySize;
  const outOffset = dbOffset + dbSize;
  
  const queryView = new Uint8Array(memory.buffer, queryOffset, querySize);
  const dbView = new Uint8Array(memory.buffer, dbOffset, dbSize);
  const outDistancesView = new Uint32Array(memory.buffer, outOffset, recordCount);

  // 3. Fill query and database vectors with dummy binary logs
  queryView.fill(0b10101010);
  dbView.fill(0b11001100);

  // 4. Run the high-speed Zig bitwise POPCNT scan
  console.time('POPCNT Matcher Run');
  exports.scanDatabase(queryOffset, dbOffset, recordCount, outOffset);
  console.timeEnd('POPCNT Matcher Run');

  // 5. Read distances (number of differing bits)
  console.log(`First record bitwise distance: ${outDistancesView[0]} bits`);
}

runDeduplicator();
```

---

## 🛠️ How to Compile Zig to WASM

If you modify `qsag_matcher.zig`, you can recompile it to freestanding WebAssembly using the standard Zig compiler:

```bash
zig build-lib qsag_matcher.zig -target wasm32-freestanding -dynamic -O ReleaseFast
```
This generates a highly optimized, freestanding `qsag_matcher.wasm` file with no external dependencies or JS glue code.
