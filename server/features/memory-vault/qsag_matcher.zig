// qsag_matcher.zig
// Compiles to freestanding WebAssembly (WASM) for ultra-fast bitwise POPCNT scans.

export fn scanDatabase(
    query: [*]const u8,
    db_buffer: [*]const u8,
    record_count: usize,
    out_distances: [*]u32,
) void {
    var i: usize = 0;
    while (i < record_count) : (i += 1) {
        // Each record is 64 bytes: [UUID: 16b][Packed Vector: 48b]
        // Packed Vector starts at offset i * 64 + 16
        const base_offset = i * 64 + 16;
        var distance: u32 = 0;
        
        var j: usize = 0;
        while (j < 48) : (j += 1) {
            const byte_a = query[j];
            const byte_b = db_buffer[base_offset + j];
            distance += @popCount(byte_a ^ byte_b);
        }
        
        out_distances[i] = distance;
    }
}
