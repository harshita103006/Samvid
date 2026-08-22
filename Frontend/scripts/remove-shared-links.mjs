import fs from "node:fs";

const replace = (text, pattern, replacement) => text.replace(new RegExp(pattern, "g"), replacement);
const homePath = "client/src/pages/Home.tsx";
let home = fs.readFileSync(homePath, "utf8");
home = replace(home, String.raw`export function encodeSharedAccessReference[\\s\\S]*?export function normalizeSharedAccessReference[\\s\\S]*?\\n}\\n`, "");
home = replace(home, String.raw`  const sharedDetails = decodeSharedAccessReference\\(recordReference\\);\\n`, "");
home = replace(home, String.raw`  const \\[recordReference, setRecordReference\\] = useState\\(.*?\\);\\n`, "");
home = replace(home, String.raw`  const \\[gatewayTab, setGatewayTab\\] = useState<.*?;\\n`, "");
home = replace(home, String.raw`  const requestByReference = async \\(\\) => \\{[\\s\\S]*?\\n  \\};\\n`, "");
home = replace(home, String.raw`  const checkReferenceAccess = async \\(\\) => \\{[\\s\\S]*?\\n  \\};\\n`, "");
home = replace(home, String.raw`  const continueWithReference = \\(\\) => \\{[\\s\\S]*?\\n  \\};\\n`, "");
home = replace(home, String.raw`    const hasGatewayReference = .*?;\\n`, "");
home = replace(home, String.raw`    if \\(hasGatewayReference && getAccessToken\\(\\)\\) return \"APP\";\\n    if \\(hasGatewayReference\\) return \"LOGIN\";\\n`, "");
home = replace(home, String.raw`  const \\[view, setView\\] = useState<View>\\(\\(\\) => new URLSearchParams\\(window.location.search\\).has\\(\"gateway_ref\"\\) \\? \"GATEWAY\" : \"HOME\"\\);`, `  const [view, setView] = useState<View>("HOME");`);
home = replace(home, String.raw`    setView\\(new URLSearchParams\\(window.location.search\\).has\\(\"gateway_ref\"\\) \\? \"GATEWAY\" : \"HOME\"\\);`, `    setView("HOME");`);
home = replace(home, String.raw`<button onClick=\\{\\(\\) => \\{ setGatewayTab\\(\"browse\"\\); setGatewayError\\(\"\"\\); \\}\\}[^>]*>Browse &amp; request</button>`, `<span className="rounded-full bg-[#8B5CF6] px-4 py-2 text-[10px] font-bold tracking-[.14em] text-white">Browse &amp; request</span>`);
home = replace(home, String.raw`<button onClick=\\{\\(\\) => \\{ setGatewayTab\\(\"link\"\\); setGatewayError\\(\"\"\\); \\}\\}[^>]*>Use a shared link</button>`, "");
home = replace(home, String.raw`gatewayTab === \"browse\" \\?`, "true ?");
fs.writeFileSync(homePath, home);

const testPath = "client/src/lib/api.test.ts";
let tests = fs.readFileSync(testPath, "utf8");
tests = replace(tests, String.raw`import \\{ buildSharedAccessLink, decodeSharedAccessReference, encodeSharedAccessReference, normalizeAccessRequests, normalizeSharedAccessReference \\} from \"\\.\\.\\/pages\\/Home\";`, `import { normalizeAccessRequests } from "../pages/Home";`);
tests = replace(tests, String.raw`\\ndescribe\\(\"secure access reference transport\"[\\s\\S]*?\\n\\}\\);\\n`, "\\n");
fs.writeFileSync(testPath, tests);
