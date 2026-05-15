# WAL Engine: Workflow and Internals

This document explains the WAL-backed storage engine used by the project (files in `src/engine/`). It describes the record format, indexing strategy, how reads/writes work, recovery, and suggested compaction and locking strategies.

## Goals

- Avoid full-file rewrites on insert/update (O(1) append).  
- Provide O(1) point-reads by id via an on-disk index.  
- Simple, durable append-only format that can be replayed.

## Record format

Each WAL record is stored as a length-prefixed JSON blob:

```
<length>\n<json>\n
```

Example JSON payloads:

- Put: `{ "op": "put", "doc": { "id": "123", "name": "Alice", ... } }`
- Del: `{ "op": "del", "id": "123" }`

The `length` header lets readers skip directly to the payload and tolerate incomplete tail writes.

## Indexing

- A simple index file (`<wal>.idx`) stores a JSON object mapping `id -> offset` (the byte offset in the WAL where the record header begins).
- On normal operations, after appending a `put` or `del`, the index is updated in-memory and written to the `.idx` file (atomic write).
- If `.idx` is missing or corrupted, the engine rebuilds it by scanning the WAL from start to finish, applying `put`/`del` operations to reconstruct the latest mapping.

## Writing (append)

1. Serialize the operation (put/del) as JSON and compute its length.  
2. Acquire any in-process serialization (the engine uses per-file queues in the code).  
3. Determine the write offset by querying the current WAL file size, then write the header + payload at that offset and fsync.  
4. Update the in-memory index and persist it to the `.idx` file using an atomic write.

This approach minimizes the time between a successful append and a durable index update; it also keeps most write activity as small sequential appends.

## Reading by id

1. Look up `id` in the in-memory index. If absent, return `null`.  
2. Seek to the stored offset, parse the length header, read the JSON payload and return the `doc` for `put` records (ignore `del`).

This avoids deserializing the whole table for point reads.

## Rebuilding index / recovery

- On init, the engine attempts to read `wal.idx`. If valid, it loads the index.  
- If missing or invalid, the engine scans the WAL sequentially and updates the in-memory index as it sees `put`/`del` ops.  
- Once rebuilt, the index is atomically written to disk to speed future startups.

## Compaction (required)

- Motivation: WAL grows indefinitely; a compaction step produces a compact snapshot containing only the current live documents and resets the WAL.
- Suggested approach:
  1. Acquire a compaction lock (prevent writers or coordinate with them).  
  2. Iterate over the current index and write a new snapshot file (e.g., `<table>.snap`) containing only live documents in a sequential JSON array or length-prefixed records.  
  3. Atomically rotate files: move snapshot into place and start a fresh WAL file for subsequent appends; rewrite the index from the snapshot and persist it.  
  4. Optionally keep older WAL snapshots for recovery until compaction is confirmed.

Compaction should be performed periodically (size threshold or time-based) and ideally in a background process.

## Multi-process concurrency

- Current code guarantees single-process operation safety (per-file op queue + atomic writes).  
- To make multi-process safe, add an inter-process lock (advisory `flock` on Unix, or a lockfile with O_EXCL semantics).  
- Writers should acquire an exclusive lock before appending; readers can either use shared locks or read the snapshot/index only.

## Limitations & caveats

- No compaction implemented yet — plan to add it before production use where disk growth matters.  
- No cross-process locking — multiple Node processes appending to the same WAL without coordination can corrupt offsets or interleave writes.  
- Index persistence is simple JSON — for very large indexes consider a binary or incremental checkpoint format.

## Migration & compatibility

- The WAL backend is implemented as an alternate `Table`-like class; you can migrate an existing JSON table to WAL by reading all records and writing `put` entries into the WAL, then building/persisting the index.

## Where to look in the code

- `src/engine/wal_engine.ts` — WAL mechanics, append/read, index persistence, rebuild.  
- `src/engine/wal_table.ts` — WAL-compatible `Table` wrapper implementing the public API (`insert`, `findById`, `findAll`, `update`, `deleteById`).

---

If you want, I can implement compaction next (snapshot + rotate) or add cross-process locking; tell me which to prioritize.
