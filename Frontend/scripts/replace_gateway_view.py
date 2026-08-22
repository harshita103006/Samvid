from pathlib import Path
import re

path = Path('/home/ubuntu/samvid-frontend/client/src/pages/Home.tsx')
source = path.read_text()
start = source.index('function GatewayView(')
end = source.index('\nfunction RoleSidebar', start)
replacement = r'''function GatewayView({ permissions, records, organizations, loading, dataError, backendUserRole, onOpenPermissions }: { permissions: Permission[]; records: DataRecord[]; organizations: Organization[]; loading: boolean; dataError: string; backendUserRole?: string; onOpenPermissions: () => void }) {
  const [orgId, setOrgId] = useState("");
  const [recordId, setRecordId] = useState("");
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [gatewayError, setGatewayError] = useState("");
  const [secureViewUrl, setSecureViewUrl] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [requestNotice, setRequestNotice] = useState("");
  const [directory, setDirectory] = useState<{ owner_id: number; owner_name: string; records: { record_id: number; title: string; record_type: string }[] }[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [selectedDirRecordId, setSelectedDirRecordId] = useState("");
  useEffect(() => {
    if (backendUserRole !== "ORGANIZATION") return;
    let cancelled = false;
    setDirectoryLoading(true); setDirectoryError("");
    api.listRecords().then((rows: unknown) => { if (!cancelled) setDirectory(Array.isArray(rows) ? rows : []); }).catch((cause: unknown) => { if (!cancelled) setDirectoryError(cleanAccessMessage(cause, "The owner directory is not available yet.")); }).finally(() => { if (!cancelled) setDirectoryLoading(false); });
    return () => { cancelled = true; };
  }, [backendUserRole]);
  const selectedOwnerEntry = directory.find(item => String(item.owner_id) === selectedOwnerId);
  const ownerRecords = selectedOwnerEntry?.records ?? [];
  const organization = organizations.find(item => String(item.id) === orgId);
  const selectedRecord = records.find(item => String(item.id) === recordId);
  useEffect(() => { if (!orgId && organizations[0]) setOrgId(String(organizations[0].id)); if (!recordId && records[0]) setRecordId(String(records[0].id)); }, [orgId, recordId, organizations, records]);
  useEffect(() => () => { if (secureViewUrl) URL.revokeObjectURL(secureViewUrl); }, [secureViewUrl]);
  const checkPermission = async () => {
    if (!selectedRecord) return;
    setGatewayError(""); setSecureViewUrl(""); setChecking(true); setChecked(false);
    try { const { response, mimeType } = await fetchSecureRecord(selectedRecord.id); const blob = await response.blob(); setSecureViewUrl(URL.createObjectURL(new Blob([blob], { type: mimeType }))); setChecked(true); }
    catch (cause) { setChecked(true); setGatewayError(cleanAccessMessage(cause, "This record is not currently shared with your organization.")); }
    finally { setChecking(false); }
  };
  const requestAccess = async () => {
    if (!selectedRecord || !requestPurpose.trim()) { setGatewayError("Select a record and enter why your organization needs view-only access."); return; }
    setGatewayError(""); setRequestNotice(""); setChecking(true);
    try { await api.createAccessRequest({ record_id: selectedRecord.id, purpose: requestPurpose.trim(), requested_access_type: "VIEW_ONLY" }); setRequestNotice("Access request sent to the record owner for approval."); setRequestPurpose(""); }
    catch (cause) { setGatewayError(cleanAccessMessage(cause, "The request could not be sent. Please try again.")); }
    finally { setChecking(false); }
  };
  const demandAccess = async () => {
    if (!selectedOwnerId || !selectedDirRecordId || !requestPurpose.trim()) { setGatewayError("Select a Data Owner, a record ID, and add a purpose for view-only access."); return; }
    setGatewayError(""); setRequestNotice(""); setChecking(true);
    try { await api.createAccessRequest({ record_id: selectedDirRecordId, purpose: requestPurpose.trim(), requested_access_type: "VIEW_ONLY" }); setRequestNotice("ID-based access request sent. The Data Owner can review it in Permissions."); setRequestPurpose(""); setSelectedDirRecordId(""); }
    catch (cause) { setGatewayError(cleanAccessMessage(cause, "The request could not be sent. Please try again.")); }
    finally { setChecking(false); }
  };
  const openSecureView = () => { if (secureViewUrl) window.open(secureViewUrl, "_blank", "noopener,noreferrer"); };
  if (backendUserRole === "ORGANIZATION") return <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-5xl items-center px-5 py-8 md:px-9 md:py-10"><div className="w-full"><section className="panel mx-auto max-w-2xl rounded-3xl p-6 md:p-9"><p className="eyebrow text-center">Organization gateway</p><h1 className="display mt-3 text-center text-4xl font-semibold text-[#172554]">Request owner access.</h1><p className="mx-auto mt-4 max-w-xl text-center text-sm leading-7 text-[#64748B]">Choose a Data Owner and record ID. No shareable links or reference tokens are used.</p><div className="mt-7 space-y-3">{directoryLoading ? <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-[#64748B]">Loading available Data Owners...</p> : directoryError ? <p role="alert" className="rounded-2xl border border-[#F43F5E]/25 bg-[#FFF1F2] p-4 text-left text-xs text-[#BE123C]">{directoryError}</p> : <><label className="block text-left"><span className="eyebrow">Data Owner</span><select value={selectedOwnerId} onChange={event => setSelectedOwnerId(event.target.value)} className="data-input mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]"><option value="">Select a Data Owner</option>{directory.map(entry => <option key={entry.owner_id} value={String(entry.owner_id)}>{entry.owner_name} · ID {entry.owner_id}</option>)}</select></label><label className="block text-left"><span className="eyebrow">Record ID</span><select value={selectedDirRecordId} onChange={event => setSelectedDirRecordId(event.target.value)} disabled={!selectedOwnerId} className="data-input mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554] disabled:opacity-60"><option value="">{selectedOwnerId ? "Select a record" : "Select a Data Owner first"}</option>{ownerRecords.map(item => <option key={item.record_id} value={String(item.record_id)}>{item.title} · ID {item.record_id}</option>)}</select></label><input value={requestPurpose} onChange={event => setRequestPurpose(event.target.value)} placeholder="Why does your organization need access?" className="data-input w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]" /><button onClick={() => void demandAccess()} disabled={checking || !selectedOwnerId || !selectedDirRecordId || !requestPurpose.trim()} className="w-full rounded-xl bg-[#8B5CF6] px-4 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white disabled:opacity-50">{checking ? "Sending request..." : "Request access by ID"}</button></>}{requestNotice && <p role="status" className="text-center text-xs text-[#166534]">{requestNotice}</p>}{gatewayError && <p role="alert" className="text-center text-xs text-[#BE123C]">{gatewayError}</p>}</div></section></div></main>;
  return <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-5xl items-center px-5 py-10"><div className="grid w-full gap-8 lg:grid-cols-[.8fr_1.2fr]"><section><p className="eyebrow">Protected organization access</p><h1 className="display mt-4 text-5xl font-semibold text-[#172554]">Verify by <span className="text-[#8B5CF6]">record ID.</span></h1><p className="mt-5 max-w-md text-sm leading-7 text-[#64748B]">Select an organization and record. Authorization is checked by the backend for the authenticated session.</p></section><section className="panel rounded-3xl p-6 md:p-8"><p className="eyebrow">Authenticated access check</p><h2 className="display mt-2 text-2xl text-white">Organization and record IDs</h2>{loading ? <p className="mt-7 text-sm text-[#B8B0E8]">Loading organizations and records...</p> : <div className="mt-7 space-y-4"><label className="block"><span className="eyebrow">Organization ID</span><select value={orgId} onChange={event => { setOrgId(event.target.value); setChecked(false); }} className="data-input mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]"><option value="">Select organization</option>{organizations.map(item => <option key={item.id} value={String(item.id)}>{item.name} · ID {item.id}</option>)}</select></label><label className="block"><span className="eyebrow">Record ID</span><select value={recordId} onChange={event => { setRecordId(event.target.value); setChecked(false); }} className="data-input mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]"><option value="">Select record</option>{records.map(item => <option key={item.id} value={String(item.id)}>{item.title} · ID {item.id}</option>)}</select></label><button onClick={() => void checkPermission()} disabled={!organization || !selectedRecord || checking} className="w-full rounded-xl bg-[#3B82F6] px-4 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white disabled:opacity-50">{checking ? "Checking backend authorization..." : "Check permission by ID"}</button>{dataError && <p role="alert" className="text-xs text-[#BE123C]">{dataError}</p>}{requestNotice && <p role="status" className="text-xs text-[#166534]">{requestNotice}</p>}{gatewayError && <p role="alert" className="text-xs text-[#BE123C]">{gatewayError}</p>}{checked && <div className={`rounded-2xl border p-5 ${secureViewUrl ? "border-[#22D3EE]/30 bg-[#ECFEFF]" : "border-[#EC4899]/30 bg-[#FFF1F2]"}`}>{secureViewUrl ? <><p className="text-sm font-semibold text-[#166534]">Access authorized by backend.</p><button onClick={openSecureView} className="mt-4 rounded-full border border-[#22D3EE]/40 px-4 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#2563EB]">Open secure record</button></> : <><p className="text-sm font-semibold text-[#BE123C]">Access denied.</p><p className="mt-2 text-xs text-[#64748B]">{gatewayError || "The backend did not authorize this record."}</p></>}</div>}{backendUserRole === "ORGANIZATION" && <button onClick={() => void requestAccess()} disabled={!selectedRecord || !requestPurpose.trim() || checking} className="w-full rounded-xl border border-[#C4B5FD] px-4 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#4F46E5]">Request view-only access</button>}<button onClick={onOpenPermissions} className="text-[10px] font-bold uppercase tracking-[.18em] text-[#2563EB]">View request status</button></div>}</section></div></main>;
}
'''
path.write_text(source[:start] + replacement + source[end:])
