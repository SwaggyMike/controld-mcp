# Agent guidance

- Keep the Control D token out of source control, logs, test fixtures, and MCP output. The preferred runtime file is `~/.config/controld-mcp.env` with mode `0600`.
- MCP protocol output belongs on stdout; diagnostics belong on stderr.
- Every mutating tool must require `confirm: true` and should verify the resulting state.
- Do not add a generic request or arbitrary-URL tool. Keep API paths and analytics hosts constrained. The only other host is the fixed `https://dns.controld.com/{endpointId}` resolver used by `check_domain`, which never receives the token.
- Treat activity-log data as sensitive and never persist it.
- Control D's API is unversioned. Keep undocumented dashboard contracts isolated and tested.
- Use `.js` suffixes for local imports so compiled ESM works in Node.
