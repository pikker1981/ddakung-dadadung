/* Pure validation at the external .mai.json boundary. Caller normalizes the
 * entire document before creating or switching a library entry. */
function validateScoreImport(doc, instrumentIds, limits = {minBpm:40, maxBpm:220}) {
  if(!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.measures) || !doc.measures.length || doc.measures.length > 2000) throw new Error('Invalid measure list');
  for(const m of doc.measures) {
    if(!m || typeof m !== 'object' || Array.isArray(m) || !instrumentIds.some(id => Array.isArray(m[id]))) throw new Error('Invalid measure');
    for(const id of instrumentIds) {
      if(m[id] === undefined) continue;
      if(!Array.isArray(m[id]) || m[id].length > 4096 || m[id].some(value => typeof value !== 'boolean' && (typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('Invalid instrument row');
    }
    if(m.ts !== undefined && (!Array.isArray(m.ts) || m.ts.length !== 2 || !m.ts.every(Number.isFinite) || !Number.isInteger(m.ts[0]) || m.ts[0] < 1 || m.ts[0] > 16 || ![4,8].includes(m.ts[1]))) throw new Error('Invalid time signature');
  }
  const candidate = doc.bpm === undefined ? 100 : doc.bpm;
  if(typeof candidate !== 'number' || !Number.isFinite(candidate)) throw new Error('Invalid tempo');
  // Never coerce user objects into keys or accept Object.prototype members.
  // Missing/empty legacy values retain the original default presentation.
  const enumValue = (value, allowed, fallback) => {
    if(value === undefined || value === null || value === '') return fallback;
    if(typeof value !== 'string' || !allowed.includes(value)) throw new Error('Invalid presentation option');
    return value;
  };
  const style = enumValue(doc.style, ['classic','jazz','hand'], 'classic');
  const hsize = enumValue(doc.hsize, ['small','normal','large'], 'normal');
  return {bpm:Math.max(limits.minBpm, Math.min(limits.maxBpm, Math.round(candidate))),style,hsize};
}

// Prepare every candidate before the caller makes any storage/library changes.
function prepareBackupBodies(bodies, prepare) {
  const entries = []; let invalid = 0;
  for(const body of bodies) {
    try {
      if(typeof body !== 'string') throw new Error('Invalid backup body');
      const doc = prepare(JSON.parse(body));
      entries.push({doc, body:JSON.stringify(doc)});
    } catch { invalid++; }
  }
  return {entries,invalid};
}
