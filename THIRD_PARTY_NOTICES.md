# Third-party notices

AppUnpack's own code is covered by its [MIT license](LICENSE). The tools and libraries it calls retain their own licenses and notices. Integration names identify the corresponding projects and do not imply affiliation or endorsement.

| Project | Role | License |
| --- | --- | --- |
| [JADX](https://github.com/skylot/jadx) | Android bytecode decompiler inside the headless engine | [Apache-2.0](https://github.com/skylot/jadx/blob/v1.5.6/LICENSE) |
| [jadx-headless-mcp](https://github.com/1013503897/jadx-headless-mcp) | Direct Android MCP engine, pinned to release 0.7.1 | [Apache-2.0](https://github.com/1013503897/jadx-headless-mcp/blob/5844800a486d2248fa949b74c9896285f5b54de2/LICENSE) |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | `@modelcontextprotocol/client` 2.3.1: client transport and tool calls from the Node.js CLI | [Apache-2.0 transition with retained MIT contributions](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE); preserve the installed package's full `LICENSE` |
| [Node.js](https://nodejs.org/) | Caller-supplied JavaScript runtime | [Node.js and component licenses](https://github.com/nodejs/node/blob/main/LICENSE) |
| [Python](https://www.python.org/) | Caller-supplied standard-library ZIP/plist inspection for IPA files | [Python license and component notices](https://docs.python.org/3/license.html) |

The repository does not bundle Java, Python, target applications or the engine JAR. `install-tools` downloads the JAR from its upstream release on request and checks its pinned SHA-256. Preserve the release's licenses and component notices if you redistribute that artifact. Java distributions have their own terms.

The installed MCP client declares Apache-2.0 and includes transition terms: contributions without permission to relicense remain under their original MIT terms. Its complete installed license controls those qualifications; the summary above does not replace it.

The lockfile records npm dependencies and transitive versions; retain the license files included with those installed packages when redistributing them. AppUnpack's MIT license grants no rights to target APKs/IPAs or other third-party software.
