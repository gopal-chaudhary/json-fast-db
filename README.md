# quick-local-db

A tiny, zero-dependency embedded DB for small Node projects — safe atomic writes and simple Table/Collection primitives. Ideal for prototyping, local tools, CLIs and single-process apps.

## Features

- File-per-table storage (JSON array of records) — legacy backend
- WAL-backed storage (default): append-only WAL + on-disk `id -> offset` index for fast point-reads
- Simple `Table` base class with CRUD: `insert`, `findAll`, `findBy`, `findOne`, `findById`, `update`, `deleteById`
- `Collection` to group tables (directory per collection)
- `JsonDB` convenience wrapper for a single collection
- Atomic writes with per-file queue (temp file + rename) to reduce corruption risk

## Limitations

- Default setup is single-process safe by default: concurrent operations inside one Node process are supported. A simple lockfile is used during compaction rotation, but full multi-process writer coordination (e.g. using `flock` or OS-level advisory locks for every writer) is not provided — enable OS-level locking for production multi-process use.
- No secondary indexes or advanced query engine: there is an `id` → offset index for O(1) point-reads, but `findBy`/`findAll` still scan live records and are O(N).
- Automatic background compaction is implemented (configurable). Compaction reclaims space and keeps full-table scans efficient; however, tune compaction thresholds for long-running deployments and monitor disk usage.

# quick-local-db

A minimal embedded database for Node.js focused on local, single-process use cases. It provides a simple `Table`/`Collection` API and ships with a WAL-backed storage engine by default for fast point-reads and cheap appends.

Install

```bash
npm install quick-local-db
```

Quick start (ESM)

```js
import JsonDB from 'quick-local-db'
import Table from 'quick-local-db/dist/model/table.js'

class User extends Table {}

const db = new JsonDB('users', './data/users')
const users = db.registerTable(User)

await users.insert({ name: 'Alice' })
console.log(await users.findAll())
```

What this package provides

- A `Table` base class with familiar CRUD: `insert`, `findAll`, `findBy`, `findOne`, `findById`, `update`, `deleteById`.
- `Collection` to group tables (one directory per collection).
- Default WAL backend: append-only log + on-disk `id -> offset` index for O(1) point-reads and O(1) appends.
- Automatic background compaction (configurable defaults) and a simple lockfile-based inter-process lock used during compaction to reduce cross-process races.

Important limitations (read before using in production)

- Single-process safe by default: concurrent operations inside one Node process are supported. A simple lockfile is used for compaction rotation, but if you run multiple Node processes that perform writes concurrently you should enable OS-level locking (e.g. `flock`) or other coordination and test thoroughly.
- No secondary indexes or query planner — point-reads by `id` are fast; `findBy`/`findAll` scan records and have O(N) cost.
- Automatic background compaction is enabled by default (configurable). Monitor disk usage and tune compaction thresholds for long-running deployments.

Documentation and examples

- Developer docs and architecture details: `docs/workflow.md` (WAL format, compaction, recovery, migration).  
- Runnable examples: `playground/examples/` (CRUD, collection ops, concurrency).  
- Tests: `test/run-tests.js` demonstrates common flows and validates both backends.

Run tests and examples locally

```bash
npm run build
npm test
bash playground/examples/run-all-examples.sh
```

Migrating from the legacy JSON backend

If you previously stored tables as single JSON files, you can migrate by reading the JSON array and writing `put` entries into the WAL (see `docs/workflow.md` for a migration outline).

If you need help with configuration (compaction thresholds, logging, or locking), or want a migration script added to the repo, open an issue or ask here and I can add it.

License

ISC (see LICENSE file)

TypeScript types
- The package emits declaration files (`dist/index.d.ts`) so TypeScript consumers get types. The `JSONObject` type used by `Table` is `{ [k: string]: any }`.

## Why atomic writes?

Writes are performed via a safe sequence: write to a temporary file and `rename()` to replace the original. Writes are also queued per file in-process so concurrent writes from the same Node process do not interleave.

## Playground code

```javascript
import JsonDB from "quick-local-db"
import Table from "quick-local-db/dist/model/table.js"

class User extends Table {}

const db = new JsonDB("users", "./playground/users")
const users = db.registerTable(User);

(async ()=>{
  const all = await users.findAll()
  let target = all[0]
  if(!target){
    target = await users.insert({ name: "Alice", email: "alice@example.com" })
    console.log("Inserted:", target)
  } else {
    console.log("Using existing:", target)
  }

  const removed = await users.deleteById(target.id)
  console.log("Deleted:", removed)
})()
```

## Notes for maintainers

- `files` in `package.json` includes `dist`, `README.md`, and `LICENSE`. Source (`src`) is not shipped.
- See `playground/creation_test.js` for a runnable example.

## Examples and Tests

This project includes a small test-suite under `test/` which demonstrates the common user flows and acts as executable documentation. Run:

```bash
npm run build
npm test
```

What the tests cover:
- creating a `JsonDB` and `Collection`
- registering a `Table` model
- full CRUD cycle (`insert`, `findAll`, `findBy`, `findOne`, `findById`, `update`, `deleteById`)
- removing a table file via `deleteTable` and deleting the collection via `drop`
- concurrent inserts to exercise the atomic-writer queue and ensure no write corruption

If you want more examples, see `playground/creation_test.js` which demonstrates typical usage and can be run directly after `npm run build`.

Playground examples: `playground/examples/` includes:
- `table_crud_example.js` — full CRUD demo for a `User` table.
- `collection_example.js` — demonstrates `deleteTable` and `drop` on a collection.
- `concurrency_example.js` — performs many concurrent inserts to exercise atomic writes.
- `run-all-examples.sh` — helper script to build and run all examples.

Run examples:

```bash
npm run build
bash playground/examples/run-all-examples.sh
```

**Architecture & Internals**

This project now ships two storage backends and the README below describes their trade-offs:

- **JSON-file backend (original):** each table is stored as a single JSON file and mutations rewrite the whole file. Simple and easy to inspect, but writes and point-reads cost O(N) (not suitable for large tables).
- **WAL backend (new):** each table uses an append-only WAL file plus a small on-disk index mapping `id -> offset`. Inserts and updates append small records (O(1)), and lookups by id are direct seeks (O(1)). The WAL implementation files are in `src/engine/` and the WAL backend is `WalTable`.

Key notes:
- WAL file format: length-prefixed JSON records. Each record is either `put` (with `doc`) or `del` (with `id`). The index (file `.wal.idx`) stores `id` → offset into the WAL for fast reads.
- Durability: writes are appended and flushed; the index is kept on disk but rebuilt from WAL if missing or corrupted.
- Compaction: WAL grows over time; this project includes automatic background compaction (with configurable interval and size thresholds) which snapshots the live state and rotates the WAL. The compaction process uses a simple lockfile during rotation to reduce cross-process races; for stronger multi-process guarantees consider adding OS-level advisory locks.
- Concurrency: single-process concurrent writes are handled (per-file operation queue + atomic write). Cross-process writer locking is not yet implemented — add `flock`/lockfile for multi-process safety before using in concurrent server processes.

Where to read more
- Implementation and internal workflow for WAL: `docs/workflow.md` (new). It explains record format, index rebuild, append/read semantics, and compaction suggestions.
- Tests and examples: `test/run-tests.js` validates both backends and `playground/examples/` contains runnable samples.

If you want me to implement compaction, inter-process locking, or a migration tool from JSON → WAL, tell me which to prioritize and I'll add it next.

## Contributing

Issues and PRs welcome. For major changes (WAL, concurrency, indexing) let's discuss design before implementation.

## License

ISC (see `LICENSE` file)
