from pathlib import Path
import re

home = Path('/home/ubuntu/samvid-frontend/client/src/pages/Home.tsx')
text = home.read_text()
text = re.sub(r'type SharedAccessReference = .*?;\n', '', text)
text = re.sub(r'export function encodeSharedAccessReference[\s\S]*?export function normalizeSharedAccessReference[\s\S]*?\n}\n', '', text)
text = re.sub(r'  const shareRecordReference = async \(record: \(typeof initialRecords\)\[number\]\) => \{[\s\S]*?\n  \};\n', '', text)
text = re.sub(r'<button onClick=\{\(\) => void shareRecordReference\(record\)\}[^>]*>Share access reference</button>', '', text)
text = re.sub(r'    const hasGatewayReference = .*?\n', '', text)
text = re.sub(r'    if \(hasGatewayReference && getAccessToken\(\)\) return "APP";\n    if \(hasGatewayReference\) return "LOGIN";\n', '', text)
text = re.sub(r'  const \[backendSession, setBackendSession\] = useState\(\(\) => .*?gateway_ref.*?;\n', '  const [backendSession, setBackendSession] = useState(() => window.location.pathname !== "/" && window.localStorage.getItem(FORCE_LOGIN_KEY) !== "1" && Boolean(getAccessToken()));\n', text)
text = re.sub(r'  const \[view, setView\] = useState<View>\(\(\) => .*?gateway_ref.*?\);', '  const [view, setView] = useState<View>("HOME");', text)
text = re.sub(r'    setView\(new URLSearchParams\(window.location.search\).has\("gateway_ref"\) \? "GATEWAY" : "HOME"\);', '    setView("HOME");', text)
home.write_text(text)

test = Path('/home/ubuntu/samvid-frontend/client/src/lib/api.test.ts')
t = test.read_text()
t = re.sub(r'import \{ buildSharedAccessLink, decodeSharedAccessReference, encodeSharedAccessReference, normalizeAccessRequests, normalizeSharedAccessReference \} from "\.\./pages/Home";', 'import { normalizeAccessRequests } from "../pages/Home";', t)
t = re.sub(r'\ndescribe\("secure access reference transport"[\s\S]*?\n\}\);\n', '\n', t)
test.write_text(t)
