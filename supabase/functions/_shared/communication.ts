import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
export { admin } from './billing.ts';
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-conversation-id, x-request-id, x-file-name', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function authenticated(request: Request) {
 const authorization=request.headers.get('Authorization') || '';
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(authorization.replace(/^Bearer /,''));
 if(error||!data.user) throw new Error('Sign in first.');
 return {db,user:data.user};
}
