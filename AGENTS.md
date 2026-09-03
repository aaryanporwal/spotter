# Agents

Project knowledge is Google OKF v0.2 in `knowledge/`. Context is scarce; do not dump it.

1. Read [`knowledge/index.md`](knowledge/index.md). Do not glob `knowledge/`.
2. Open only concepts whose description matches this task (usually 0-2 files).
3. Then read the source files those concepts name. Code and `README.md` win on conflict.
4. Skip `knowledge/log.md` unless the task is knowledge history.
5. Put nothing in `knowledge/` that already lives in source, tests, config, or `README.md`. If a concept is wrong, fix or `status: deprecated` it in the same change.
