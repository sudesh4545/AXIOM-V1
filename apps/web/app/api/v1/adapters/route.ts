import { ensureDatabase, getDatabase } from '../../../../db';
import { adaptPostHog, adaptStripe } from '../../../lib/server/integration-adapters';
import { validateTaxonomy } from '../../../lib/server/event-taxonomy';
import { requestIdentity, type RequestIdentity } from '../../../lib/server/request-identity';
import { resolveWorkspaceAccess } from '../../../lib/server/workspace-access';
import { enforceRateLimit, secureJson } from '../../../lib/server/http-security';

export const dynamic = 'force-dynamic';
function json(body: unknown, status=200) { return secureJson(body,status); }
function clean(value:unknown, field:string, max=120) { if(typeof value!=='string'||!value.trim()||value.trim().length>max) throw new Error(`${field} is required and must be at most ${max} characters.`); return value.trim(); }
async function authorize(request:Request, workspaceId:string):Promise<RequestIdentity|Response>{
  const identity=await requestIdentity(request); if(!identity)return json({code:'authentication_required',message:'Sign in to connect an adapter.',details:null},401);
  await ensureDatabase(); const now=new Date().toISOString(); await getDatabase().prepare(`INSERT INTO axiom_users (id,email,display_name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at`).bind(identity.userId,identity.email,identity.displayName,now,now).run();
  const access=await resolveWorkspaceAccess(identity,workspaceId); if(access.active.id!==workspaceId)return json({code:'workspace_forbidden',message:'That workspace is not available to this account.',details:null},403); return identity;
}

export async function POST(request:Request):Promise<Response>{
  try{
    const body=await request.json().catch(()=>null) as {workspaceId?:unknown;provider?:unknown;deliveryId?:unknown;payload?:unknown}|null;
    if(!body)return json({code:'invalid_json',message:'A JSON adapter delivery is required.',details:null},400);
    const workspaceId=clean(body.workspaceId,'workspaceId'); const provider=clean(body.provider,'provider',20).toLowerCase(); const deliveryId=clean(body.deliveryId,'deliveryId');
    if(!['posthog','stripe'].includes(provider))return json({code:'unsupported_provider',message:'provider must be posthog or stripe.',details:null},400);
    const identity=await authorize(request,workspaceId); if(identity instanceof Response)return identity;
    const limited=await enforceRateLimit(request,'adapters:ingest',120,60);if(limited)return limited;
    const db=getDatabase(); const prior=await db.prepare('SELECT accepted_count,duplicate_count FROM integration_deliveries WHERE workspace_id=? AND provider=? AND external_id=?').bind(workspaceId,provider,deliveryId).first<{accepted_count:number;duplicate_count:number}>();
    if(prior)return json({provider,deliveryId,accepted:prior.accepted_count,duplicates:prior.duplicate_count,replayed:true},202);
    const events=provider==='posthog'?adaptPostHog(body.payload):adaptStripe(body.payload); events.forEach(validateTaxonomy);
    const now=new Date().toISOString(); const results=await db.batch(events.map((event)=>db.prepare(`INSERT INTO ingested_events (id,workspace_id,user_id,source,idempotency_key,event_type,event_name,anonymous_id,properties_json,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,idempotency_key) DO NOTHING`).bind(crypto.randomUUID(),workspaceId,identity.userId,provider,event.idempotencyKey,event.eventType,event.eventName,event.anonymousId,JSON.stringify(event.properties),event.occurredAt,now)));
    const accepted=results.reduce((sum,result)=>sum+Number(result.meta.changes??0),0); const duplicates=events.length-accepted;
    await db.batch([
      db.prepare(`INSERT INTO integration_deliveries (id,workspace_id,provider,external_id,accepted_count,duplicate_count,received_at) VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,provider,deliveryId,accepted,duplicates,now),
      db.prepare(`INSERT INTO source_connections (workspace_id,source,status,event_count,last_event_at,updated_at) VALUES (?,?,'connected',?,?,?) ON CONFLICT(workspace_id,source) DO UPDATE SET status='connected',event_count=event_count+excluded.event_count,last_event_at=excluded.last_event_at,updated_at=excluded.updated_at`).bind(workspaceId,provider,accepted,now,now),
      db.prepare(`INSERT INTO audit_events (id,user_id,action,entity_type,entity_id,metadata_json,created_at) VALUES (?,?,'ingest_adapter_delivery','workspace',?,?,?)`).bind(crypto.randomUUID(),identity.userId,workspaceId,JSON.stringify({provider,deliveryId,accepted,duplicates}),now),
    ]);
    return json({provider,deliveryId,accepted,duplicates,replayed:false},202);
  }catch(error){
    if(error instanceof Error&&/required|must|invalid|contain|support|INR/.test(error.message))return json({code:'invalid_adapter_delivery',message:error.message,details:null},400);
    console.error('AXIOM adapter delivery failed',error); return json({code:'adapter_delivery_failed',message:'AXIOM could not process this adapter delivery.',details:null},500);
  }
}
