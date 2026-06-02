/**
 * NEXUS AUTOMATA — Baileys Auth State via Supabase
 * Substitui useMultiFileAuthState (arquivo) por Supabase (persistente entre deploys)
 */
import { createClient } from '@supabase/supabase-js';
import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TABLE = 'baileys_auth';

async function get(key) {
  const { data } = await supabase.from(TABLE).select('value').eq('key', key).single();
  if (!data) return null;
  return JSON.parse(data.value, BufferJSON.reviver);
}

async function set(key, value) {
  const serialized = JSON.stringify(value, BufferJSON.replacer);
  await supabase.from(TABLE).upsert({ key, value: serialized }, { onConflict: 'key' });
}

async function del(key) {
  await supabase.from(TABLE).delete().eq('key', key);
}

export async function useSupabaseAuthState() {
  let creds = await get('creds');
  if (!creds) creds = initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            const data = await get(`${type}-${id}`);
            if (data) {
              result[id] = type === 'app-state-sync-key'
                ? proto.Message.AppStateSyncKeyData.fromObject(data)
                : data;
            }
          }
          return result;
        },
        set: async (data) => {
          for (const [type, ids] of Object.entries(data)) {
            for (const [id, value] of Object.entries(ids)) {
              value ? await set(`${type}-${id}`, value) : await del(`${type}-${id}`);
            }
          }
        }
      }
    },
    saveCreds: async () => {
      await set('creds', creds);
    }
  };
}
