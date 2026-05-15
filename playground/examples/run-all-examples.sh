#!/usr/bin/env bash
set -euo pipefail

# Helper to build and run all playground examples
npm run build
node playground/examples/table_crud_example.js
node playground/examples/collection_example.js
node playground/examples/concurrency_example.js
