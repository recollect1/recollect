// Family page API client. In dev the Vite proxy adds the family token server-side.

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${res.status})`);
  return json as T;
}

export interface Person { id: string; name: string; relation: string; relationToElder?: string; statusLine?: string; photoUrl?: string }
export interface Medicine { id: string; name: string; purpose: string; aliases: string[]; times: string[] }
export interface Visit { id: string; personId: string; daysOfWeek: number[]; time: string; kind: 'visit' | 'call' }
export interface Photo { id: string; url: string; caption: string }
export interface Consent { id: string; trackingOn: boolean; fullVoiceOn: boolean; byElderAt?: string | null; byFamilyAt?: string | null }
export interface Overview {
  elder: { id: string; name: string }; admin: { id: string; name: string };
  people: Person[]; medicines: Medicine[]; visits: Visit[]; photos: Photo[];
  weeklyPhotoId: string | null; consent: Consent | null;
}
export interface Today {
  say: string; date: string; doses: { name: string; time: string; taken: boolean; takenAt?: string }[];
  storiesToday: number; repeatedQuestions: { label: string; count: number }[]; note: string;
}
export interface Story { sessionId: string; startedAt: string; quotes: string[]; retold: boolean }
export interface Trend { say: string; card?: { kind: string; changes: string[]; since?: string; weeks: number; simulated: boolean } }
export interface Profile {
  preferredName: string; likes: string[]; calms: string[]; upsets: string[]; routines: string[];
  communicationTips: string[]; approvedFacts: string[];
}
export interface ThisIsMe {
  say: string; candidates: string[];
  card?: { name: string; profile: Profile; people: { name: string; relation: string }[] };
}

export interface Alert { id: string; at: string; say: string; acknowledged: boolean; sms?: boolean }

export const api = {
  alerts: () => req<Alert[]>('GET', '/api/family/alerts'),
  ackAlert: (id: string) => req('POST', '/api/family/alert-ack', { id }),
  overview: () => req<Overview>('GET', '/api/family/overview'),
  today: () => req<Today>('GET', '/api/family/today'),
  stories: () => req<{ stories: Story[]; privateCount: number; prompts: { id: string; text: string }[] }>('GET', '/api/family/stories'),
  trend: () => req<Trend>('GET', '/api/family/trend'),
  thisIsMe: () => req<ThisIsMe>('GET', '/api/family/this-is-me'),
  setStatus: (personId: string, statusLine: string) => req('POST', '/api/family/status', { personId, statusLine }),
  saveMedicine: (m: { id?: string; name: string; purpose: string; aliases: string[]; times: string[] }) => req('POST', '/api/family/medicine', m),
  weeklyPhoto: (photoId: string) => req('POST', '/api/family/weekly-photo', { photoId }),
  consent: (c: { elderAgreed?: boolean; familyAgreed?: boolean; fullVoice?: boolean; off?: boolean }) => req<Consent>('POST', '/api/family/consent', c),
  deleteEverything: () => req<{ removed: number }>('POST', '/api/family/delete-everything', { confirm: 'delete everything' }),
  saveProfile: (p: Partial<Profile>) => req('POST', '/api/family/profile', p),
  fact: (fact: string, approve: boolean) => req('POST', '/api/family/fact', { fact, approve }),
};
