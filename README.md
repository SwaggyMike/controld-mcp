# Control D MCP

A local Model Context Protocol server for safely managing Control D by conversation.

It can inspect profiles and endpoints, diagnose recent blocked DNS queries, pause a profile temporarily, create block/bypass/redirect rules, and delete rules. Every live policy change requires `confirm: true` and is followed by a read-back check.

## Setup

Requires Node.js 20 or newer and a dedicated Control D **write** token. Restrict the token to trusted source IPs in Control D when possible.

```bash
npm install
npm run test
```

Put the token in `~/.config/controld-mcp.env` (never in this repository) and set the file mode to `0600`:

```dotenv
CONTROL_D_API_TOKEN=your-dedicated-write-token
```

Example Codex configuration:

```toml
[mcp_servers.controld]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/controld-mcp/dist/index.js"]
```

Restart the MCP host after adding the server.
The MCP process can start without the token, but its tools will return a setup error until the token is present and the host is restarted.

## Typical flow

1. “Show my Control D profiles.”
2. “I just tried example.com. What was blocked in the last five minutes?”
3. Review the query timestamps and the rule/filter that triggered each block.
4. “Create a temporary bypass for `cdn.example.net` on Global for 30 minutes.”
5. The assistant shows the exact proposed mutation and asks for approval before calling the confirmed write tool.

For routing: list proxy locations first, then redirect either exact domain rules or a named service with an exact location ID. A service such as YouTube can involve many changing domains, so `set_service_policy` is usually safer than trying to maintain its hostnames manually.

## Security design

- No generic HTTP/API passthrough tool.
- API and analytics hosts are constrained to Control D.
- Tokens are loaded at runtime and never returned or logged.
- Activity-log requests are bounded to 200 rows and are never cached.
- Writes require exact profile resolution and `confirm: true`.
- Prefer exact domains over wildcards. Inspect results before unblocking anything.

## API stability

Control D warns that its API is unversioned. Activity-log and several management operations use current first-party dashboard contracts because they are not all present in the public API reference. See [docs/api-contracts.md](docs/api-contracts.md).

## Acknowledgements

Endpoint behavior was cross-checked against Control D's official dashboard and the community [Control D Manager Home Assistant integration](https://github.com/ccpk1/controld-manager-ha). This project is an independent implementation.

## License

MIT
