import { Client, RichPresence, CustomStatus } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';
import { HttpsProxyAgent } from 'https-proxy-agent';

// API Keys (OSINT)
const SNUSBASE_API_KEY    = 'sb5029dec66mht55m78fx8bsw6tm8a';
const SNUSBASE_BETA_KEY   = 'LNcQwsSj44fSYcCjmyibyyv4JiDyhZq67E';
const LEAKCHECK_API_KEY   = '4344cd645b6e6cc2559c1a92017d9bfa12e4e4b1';
const INTELVAULT_API_KEY  = '0xe68a34be1597099a98678b293f8f93f5f28b5f27';
const SEON_API_KEY        = '758f5f54-befb-4125-bd17-931689af6633';
const OSINTCAT_API_KEY    = 'ebosintcat7e45090a160ca90c37db2c004c32a5fa079c56f0d09d980529fa';
const BREACHHUB_API_KEY   = 'iRjS7jsM5dr0cYT79blhVu4IapRI';
const LUPERLY_API_KEY     = '4L0FJUQSHw4kUWaa0NrhH7';
const SWATTED_API_KEYS    = [
    'm6bpt1bCadyCHAIZtiJE',
    'KfyQ38IxOrUHxayaHZkfV',
    'LEruKTnXPaljpBhgOlxQLC',
    'eVhfU9GVhDfolucBOMSsi',
    'eFCdVrsprFa2bJW0Vxd1h1',
];
const SWATTED_SECURITY_PHRASE = 'V75ZA3G8GOGM';

const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();
const loveLoops = new Map<number, boolean>();
const trappedUsers = new Map<number, Map<string, string>>();
const snipedMessages = new Map<number, Map<string, Array<{ content: string, author: string, timestamp: number }>>>();
const autoReactConfigs = new Map<number, { userOption: string, emojis: string[] }>();
const mockTargets = new Map<number, string>(); // botId -> userId to mock
const activeSpams = new Map<number, boolean>();
const rpcIntervals = new Map<number, NodeJS.Timeout>();
const statusMoverIntervals = new Map<number, NodeJS.Timeout>();
const botStartTimes = new Map<number, number>();
const afkCache = new Map<number, { active: boolean; reason: string; since: number }>();
const voiceConnections = new Map<number, any>();

// ── OSINT Helper Functions ──────────────────────────────────────────────────

async function snusbaseSearch(term: string, type: string): Promise<any> {
    try {
        const res = await fetch('https://api.snusbase.com/data/search', {
            method: 'POST',
            headers: {
                'Auth': SNUSBASE_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ terms: [term], types: [type], wildcard: false }),
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function snusbaseBetaSearch(term: string, type: string): Promise<any> {
    try {
        const res = await fetch('https://beta.snusbase.com/data/search', {
            method: 'POST',
            headers: {
                'Auth': SNUSBASE_BETA_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ terms: [term], types: [type], wildcard: false }),
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function leakcheckQuery(term: string, type = 'auto'): Promise<any> {
    try {
        const res = await fetch(`https://leakcheck.io/api/v2/query/${encodeURIComponent(term)}?type=${type}`, {
            headers: { 'X-API-Key': LEAKCHECK_API_KEY },
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function seonEmailCheck(email: string): Promise<any> {
    try {
        const res = await fetch(`https://api.seon.io/SeonRestService/fraud-api/v2/email-api/${encodeURIComponent(email)}`, {
            headers: {
                'X-API-KEY': SEON_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function seonPhoneCheck(phone: string): Promise<any> {
    try {
        // SEON expects E.164 format with leading +
        const e164 = phone.startsWith('+') ? phone : `+${phone.replace(/^\+?/, '')}`;
        const res = await fetch(`https://api.seon.io/SeonRestService/fraud-api/v2/phone-api/${encodeURIComponent(e164)}`, {
            headers: {
                'X-API-KEY': SEON_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        return await res.json();
    } catch {
        return null;
    }
}

// Generic resilient OSINT helper — tries multiple endpoint patterns / auth styles
// in sequence, returns the first successful JSON response (or { raw: text } if it
// returned 200 but wasn't JSON). Each request times out fast so a wrong endpoint
// never stalls the report.
async function tryEndpoints(endpoints: { url: string; method?: string; headers?: any; body?: any }[]): Promise<any> {
    for (const ep of endpoints) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 6000);
            const res = await fetch(ep.url, {
                method: ep.method || 'GET',
                headers: ep.headers,
                body: ep.body,
                signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (!res.ok) continue;
            const text = await res.text();
            if (!text) continue;
            try { return JSON.parse(text); } catch { return { raw: text.slice(0, 4000) }; }
        } catch { /* try next */ }
    }
    return null;
}

async function breachhubQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://api.breachhub.io/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': BREACHHUB_API_KEY } },
        { url: `https://breachhub.io/api/v1/search?q=${t}`,              headers: { 'Authorization': `Bearer ${BREACHHUB_API_KEY}` } },
        { url: `https://breachhub.io/api/search`, method: 'POST',
          headers: { 'Authorization': `Bearer ${BREACHHUB_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://api.breachhub.com/search?q=${t}`, headers: { 'X-API-Key': BREACHHUB_API_KEY } },
    ]);
}

async function luperlyQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://luperly.vercel.app/api/search?q=${t}&type=${type}`, headers: { 'X-API-Key': LUPERLY_API_KEY } },
        { url: `https://luperly.vercel.app/api/lookup?q=${t}`,              headers: { 'Authorization': `Bearer ${LUPERLY_API_KEY}` } },
        { url: `https://luperly.vercel.app/api/v1/search`, method: 'POST',
          headers: { 'X-API-Key': LUPERLY_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://luperly.vercel.app/api/${type}/${t}`, headers: { 'X-API-Key': LUPERLY_API_KEY } },
    ]);
}

async function swattedQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    // Rotate through the keys (use a different one each call to spread quota)
    const key = SWATTED_API_KEYS[Math.floor(Math.random() * SWATTED_API_KEYS.length)];
    const sec = SWATTED_SECURITY_PHRASE;
    return tryEndpoints([
        { url: `https://swatted.wtf/api/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': key, 'X-Security-Phrase': sec } },
        { url: `https://swatted.wtf/api/lookup?q=${t}`,                 headers: { 'Authorization': `Bearer ${key}`, 'X-Security-Phrase': sec } },
        { url: `https://api.swatted.wtf/v1/search`, method: 'POST',
          headers: { 'X-API-Key': key, 'X-Security-Phrase': sec, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type, security_phrase: sec }) },
        { url: `https://swatted.wtf/api/${type}/${t}`, headers: { 'X-API-Key': key, 'X-Security-Phrase': sec } },
    ]);
}

async function intelvaultQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://api.intelvault.io/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': INTELVAULT_API_KEY } },
        { url: `https://intelvault.io/api/v1/search?q=${t}`,              headers: { 'Authorization': `Bearer ${INTELVAULT_API_KEY}` } },
        { url: `https://intelvault.io/api/search`, method: 'POST',
          headers: { 'Authorization': `Bearer ${INTELVAULT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://api.intelvault.io/lookup/${type}/${t}`, headers: { 'X-API-Key': INTELVAULT_API_KEY } },
    ]);
}

async function osintcatQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://api.osintcat.com/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': OSINTCAT_API_KEY } },
        { url: `https://osintcat.com/api/v1/search?q=${t}`,              headers: { 'Authorization': `Bearer ${OSINTCAT_API_KEY}` } },
        { url: `https://osintcat.com/api/search`, method: 'POST',
          headers: { 'Authorization': `Bearer ${OSINTCAT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://api.osintcat.com/${type}/${t}`, headers: { 'X-API-Key': OSINTCAT_API_KEY } },
    ]);
}

// Walk an arbitrary object/array, pulling out values keyed by names that look
// like the requested categories. Used to surface useful fields from APIs whose
// response schema we don't know in advance.
function harvestFields(data: any, into: { emails?: Set<string>; passwords?: Set<string>; usernames?: Set<string>; names?: Set<string>; phones?: Set<string>; ips?: Set<string>; addresses?: Set<string>; dobs?: Set<string>; sources?: Set<string> }, depth = 0): number {
    if (data == null || depth > 6) return 0;
    let count = 0;
    if (Array.isArray(data)) {
        for (const v of data) count += harvestFields(v, into, depth + 1);
        return count;
    }
    if (typeof data !== 'object') return 0;
    const addrParts: string[] = [];
    for (const [rawK, v] of Object.entries(data)) {
        const k = rawK.toLowerCase();
        if (v == null || v === '') continue;
        if (typeof v === 'object') { count += harvestFields(v, into, depth + 1); continue; }
        const str = String(v).trim();
        if (!str) continue;
        if (into.emails && /(^|_)e?mail$/.test(k))                        into.emails.add(str);
        else if (into.passwords && (k === 'password' || k === 'pass' || k === 'plaintext' || k === 'pwd')) into.passwords.add(str);
        else if (into.usernames && (k === 'username' || k === 'user' || k === 'login' || k === 'handle' || k === 'nick' || k === 'nickname')) into.usernames.add(str);
        else if (into.names && (k === 'name' || k === 'fullname' || k === 'full_name' || k === 'realname' || k === 'firstname' || k === 'first_name' || k === 'lastname' || k === 'last_name')) into.names.add(str);
        else if (into.phones && (k === 'phone' || k === 'phonenumber' || k === 'phone_number' || k === 'mobile' || k === 'tel')) into.phones.add(str);
        else if (into.ips && (k === 'ip' || k === 'lastip' || k === 'last_ip' || k === 'ipaddress' || k === 'ip_address')) into.ips.add(str);
        else if (into.dobs && (k === 'dob' || k === 'birthdate' || k === 'birthday' || k === 'date_of_birth')) into.dobs.add(str);
        else if (into.sources && (k === 'source' || k === 'database' || k === 'breach' || k === 'db' || k === 'leak')) into.sources.add(str);
        else if (k === 'address' || k === 'street' || k === 'address1' || k === 'addr') addrParts.push(str);
        else if (k === 'city' || k === 'town')           addrParts.push(str);
        else if (k === 'state' || k === 'region')        addrParts.push(str);
        else if (k === 'zip' || k === 'zipcode' || k === 'postal' || k === 'postalcode' || k === 'postcode') addrParts.push(str);
        else if (k === 'country')                        addrParts.push(str);
        count++;
    }
    if (into.addresses && addrParts.length) {
        const joined = addrParts.join(', ');
        if (joined.length > 4) into.addresses.add(joined);
    }
    return count;
}

// Pretty ANSI block summarising what Breachhub + Luperly + Swatted returned for
// a given term. Empty string if all three came back empty / unreachable, so it's
// safe to concatenate into any report.
async function extraOsintBlock(term: string, kind: 'email' | 'phone' | 'username' | 'ip' | 'discord'): Promise<string> {
    // Map our kinds to a "type" parameter many breach APIs accept
    const apiType = kind === 'discord' ? 'username' : kind;

    const [bh, lu, sw, iv, oc] = await Promise.all([
        breachhubQuery(term, apiType),
        luperlyQuery(term, apiType),
        swattedQuery(term, apiType),
        intelvaultQuery(term, apiType),
        osintcatQuery(term, apiType),
    ]);

    const C = (n: number) => `\u001b[1;${n}m`;
    const CY = C(36), YE = C(33), RE = C(31), GY = C(30), MA = C(35), RST = '\u001b[0m';
    const SUB = '─'.repeat(50);
    const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

    const sources    = new Set<string>();
    const emails     = new Set<string>();
    const passwords  = new Set<string>();
    const usernames  = new Set<string>();
    const names      = new Set<string>();
    const phones     = new Set<string>();
    const ips        = new Set<string>();
    const addresses  = new Set<string>();
    const dobs       = new Set<string>();

    const buckets = { sources, emails, passwords, usernames, names, phones, ips, addresses, dobs };
    let totalFields = 0;
    if (bh) totalFields += harvestFields(bh, buckets);
    if (lu) totalFields += harvestFields(lu, buckets);
    if (sw) totalFields += harvestFields(sw, buckets);
    if (iv) totalFields += harvestFields(iv, buckets);
    if (oc) totalFields += harvestFields(oc, buckets);

    const reachable: string[] = [];
    if (bh) reachable.push('Breachhub');
    if (lu) reachable.push('Luperly');
    if (sw) reachable.push('Swatted.wtf');
    if (iv) reachable.push('IntelVault');
    if (oc) reachable.push('OSINTCat');

    if (reachable.length === 0) return '';

    let r = head('EXTRA OSINT (Breachhub · Luperly · Swatted · IntelVault · OSINTCat)');
    r += `  ${YE}Reached:${RST}    ${reachable.join(', ')}\n`;
    r += `  ${YE}Fields:${RST}     ${totalFields}\n`;
    if (sources.size)   r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
    if (names.size)     r += `  ${YE}Names:${RST}      ${Array.from(names).join(', ')}\n`;
    if (usernames.size) r += `  ${YE}Usernames:${RST}  ${Array.from(usernames).join(', ')}\n`;
    if (emails.size)    r += `  ${YE}Emails:${RST}     ${Array.from(emails).join(', ')}\n`;
    if (phones.size)    r += `  ${YE}Phones:${RST}     ${Array.from(phones).join(', ')}\n`;
    if (ips.size)       r += `  ${YE}IPs:${RST}        ${Array.from(ips).join(', ')}\n`;
    if (dobs.size)      r += `  ${YE}DOB:${RST}        ${Array.from(dobs).join(', ')}\n`;
    if (addresses.size) {
        r += `  ${YE}Addresses:${RST}\n`;
        Array.from(addresses).forEach(a => r += `    ${MA}•${RST} ${a}\n`);
    }
    if (passwords.size) {
        r += `  ${YE}Passwords (${passwords.size}):${RST}\n`;
        Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
    }
    if (totalFields === 0) {
        r += `  ${GY}— sources reachable but no fields recovered for this query —${RST}\n`;
    }
    return r;
}

async function ipApiLookup(ip: string): Promise<any> {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`);
        return await res.json();
    } catch {
        return null;
    }
}

async function ipInfoLookup(ip: string): Promise<any> {
    try {
        const res = await fetch(`https://ipinfo.io/${ip}/json`);
        return await res.json();
    } catch {
        return null;
    }
}

async function phoneVerify(phone: string): Promise<any> {
    try {
        const res = await fetch(`https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}`);
        return await res.json();
    } catch {
        return null;
    }
}

function staticMapUrl(lat: number, lon: number, zoom = 11): string {
    // Yandex static maps — keyless, returns a PNG, supports a pin marker.
    // pt=lon,lat,style ; "pm2rdl" = round red large pin.
    return `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=${zoom}&size=600,400&l=map&pt=${lon},${lat},pm2rdl`;
}

async function nominatimReverse(lat: number, lon: number): Promise<any> {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'NetrunnerBot/1.0 (reverse-geocode)',
                'Accept': 'application/json',
            },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Reverse-geocode that always returns a real street address (or nearest road),
// not a park / lake / building name. Strategy:
//   1. Query at zoom 18 (building level) to get the most specific result + full address components.
//   2. If the closest feature isn't an actual address (e.g. it's a park, water, leisure area),
//      fall back to zoom 17 / 16 to find the nearest road.
//   3. Compose the address from address components rather than `display_name`,
//      which often leads with a POI name.
async function nominatimReverseAddress(lat: number, lon: number): Promise<{
    houseNumber: string;
    road: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    countryCode: string;
    formatted: string;
    placeName: string;        // POI / building name at the exact spot, if any (for context)
    placeType: string;        // e.g. "park", "building", "residential"
    isExactAddress: boolean;  // true if a street + house number was found
} | null> {
    const ua = { 'User-Agent': 'NetrunnerBot/1.0 (reverse-geocode)', 'Accept': 'application/json' };

    const fetchAt = async (zoom: number): Promise<any> => {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${zoom}&addressdetails=1&namedetails=1`;
            const res = await fetch(url, { headers: ua });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    };

    // 1. Closest feature (building / POI / address)
    const exact = await fetchAt(18);
    const a1 = exact?.address || {};
    let road = a1.road || a1.pedestrian || a1.residential || a1.footway || a1.path || a1.cycleway || '';
    let houseNumber = a1.house_number || '';

    // 2. If we don't have a road yet, walk the zoom levels back to find the nearest street
    if (!road) {
        for (const z of [17, 16, 15]) {
            const r = await fetchAt(z);
            const ar = r?.address || {};
            const candidateRoad = ar.road || ar.pedestrian || ar.residential || '';
            if (candidateRoad) {
                road = candidateRoad;
                if (!houseNumber && ar.house_number) houseNumber = ar.house_number;
                // Also pull other components from this fallback if missing on the exact result
                for (const k of ['city', 'town', 'village', 'hamlet', 'state', 'postcode', 'country', 'country_code', 'suburb', 'neighbourhood']) {
                    if (!(a1 as any)[k] && (ar as any)[k]) (a1 as any)[k] = (ar as any)[k];
                }
                break;
            }
        }
    }

    const city = a1.city || a1.town || a1.village || a1.hamlet || a1.suburb || a1.neighbourhood || '';
    const state = a1.state || a1.region || '';
    const postcode = a1.postcode || '';
    const country = a1.country || '';
    const countryCode = (a1.country_code || '').toUpperCase();

    // Compose a real street-style address (don't use display_name, it leads with POI name)
    const street = [houseNumber, road].filter(Boolean).join(' ');
    const cityState = [city, state, postcode].filter(Boolean).join(', ').replace(', ,', ',');
    const formatted = [street, cityState, country].filter(Boolean).join(', ');

    // Identify the POI / place type at the exact coordinates (for context only)
    const placeName = exact?.name || exact?.namedetails?.name || '';
    const placeType = exact?.type || exact?.category || '';

    if (!road && !city && !country) return null;

    return {
        houseNumber,
        road,
        city,
        state,
        postcode,
        country,
        countryCode,
        formatted: formatted || exact?.display_name || '',
        placeName,
        placeType,
        isExactAddress: Boolean(houseNumber && road),
    };
}

// Parse coordinates from decimal ("42.28, -87.95") or DMS ("42°17'07.1\"N 87°57'11.5\"W").
function parseCoordinates(input: string): { lat: number, lon: number } | null {
    const s = input.trim().replace(/[，;]/g, ',');

    // Try plain decimal: "lat, lon" or "lat lon"
    const dec = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (dec) {
        const lat = parseFloat(dec[1]);
        const lon = parseFloat(dec[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
        }
    }

    // DMS: 42°17'07.1"N 87°57'11.5"W   (degrees / minutes / seconds, hemisphere)
    const dmsRe = /(\d+(?:\.\d+)?)\s*[°ºd:\s]\s*(\d+(?:\.\d+)?)?\s*['′m:\s]?\s*(\d+(?:\.\d+)?)?\s*["″s]?\s*([NSEW])/gi;
    const matches = [...s.matchAll(dmsRe)];
    if (matches.length >= 2) {
        const toDec = (m: RegExpMatchArray) => {
            const deg = parseFloat(m[1] || '0');
            const min = parseFloat(m[2] || '0');
            const sec = parseFloat(m[3] || '0');
            const hem = (m[4] || '').toUpperCase();
            let v = deg + min / 60 + sec / 3600;
            if (hem === 'S' || hem === 'W') v = -v;
            return { v, hem };
        };
        const a = toDec(matches[0]);
        const b = toDec(matches[1]);
        let lat: number | null = null, lon: number | null = null;
        if (a.hem === 'N' || a.hem === 'S') lat = a.v;
        if (a.hem === 'E' || a.hem === 'W') lon = a.v;
        if (b.hem === 'N' || b.hem === 'S') lat = b.v;
        if (b.hem === 'E' || b.hem === 'W') lon = b.v;
        if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
        }
    }

    return null;
}

// ── WHO IS (Wikidata person lookup) ─────────────────────────────────────────
// Uses the public Wikipedia + Wikidata APIs (no key, fully ToS-compliant).
// Returns rich biographical + family info for notable people (public figures,
// celebrities, athletes, politicians, historical figures). Private individuals
// will not be in Wikidata — no public free API exists for that.
const WD_REL = {
    P22:   'father',
    P25:   'mother',
    P26:   'spouse',
    P40:   'child',
    P3373: 'sibling',
    P39:   'position held',
    P106:  'occupation',
    P27:   'citizenship',
    P19:   'place of birth',
    P20:   'place of death',
    P569:  'date of birth',
    P570:  'date of death',
    P21:   'gender',
    P735:  'given name',
    P734:  'family name',
} as const;

async function wdSearchPerson(name: string): Promise<{ id: string; label: string; description: string } | null> {
    try {
        const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5&type=item&origin=*`;
        const res = await fetch(url, { headers: { 'User-Agent': 'NetrunnerBot/1.0 (osint-whois)' } });
        if (!res.ok) return null;
        const data: any = await res.json();
        const hits = data?.search || [];
        // Prefer the first hit whose description suggests a person (contains common person-y words)
        const personHints = /\b(actor|actress|singer|player|politician|writer|author|musician|model|director|footballer|basketball|rapper|producer|engineer|scientist|philosopher|artist|painter|king|queen|emperor|president|ceo|businessman|businesswoman|youtuber|streamer|journalist|chef|athlete|boxer|wrestler|comedian|host|judge|architect|astronaut|monarch|pope|saint|general|admiral|soldier|prince|princess|duke|duchess|noble|footballer|coach|composer)\b/i;
        const personHit = hits.find((h: any) => personHints.test(h.description || ''));
        const pick = personHit || hits[0];
        if (!pick) return null;
        return { id: pick.id, label: pick.label || name, description: pick.description || '' };
    } catch { return null; }
}

async function wdGetEntities(ids: string[]): Promise<Record<string, any>> {
    if (ids.length === 0) return {};
    try {
        const out: Record<string, any> = {};
        // Wikidata caps wbgetentities at 50 ids per call
        for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&props=labels|descriptions|claims&languages=en&format=json&origin=*`;
            const res = await fetch(url, { headers: { 'User-Agent': 'NetrunnerBot/1.0 (osint-whois)' } });
            if (!res.ok) continue;
            const data: any = await res.json();
            Object.assign(out, data?.entities || {});
        }
        return out;
    } catch { return {}; }
}

function wdClaimIds(entity: any, prop: string): string[] {
    const claims = entity?.claims?.[prop] || [];
    return claims
        .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
        .filter((x: any): x is string => typeof x === 'string');
}

function wdClaimTime(entity: any, prop: string): string | null {
    const claims = entity?.claims?.[prop] || [];
    const v = claims[0]?.mainsnak?.datavalue?.value?.time;
    if (!v) return null;
    // Wikidata times look like "+1980-05-12T00:00:00Z"
    const m = v.match(/^[+-]?(\d{1,4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [_, y, mo, d] = m;
    if (mo === '00' && d === '00') return y;
    if (d === '00') return `${y}-${mo}`;
    return `${y}-${mo}-${d}`;
}

// Forward geocode: address string → coordinates + OSM place metadata
async function nominatimSearch(query: string): Promise<any | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&extratags=1&namedetails=1&limit=1`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'NetrunnerBot/1.0 (geocode)', 'Accept': 'application/json' },
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch { return null; }
}

// Overpass API: find named businesses, amenities, shops at / near a coord (within radiusMeters)
async function overpassNearby(lat: number, lon: number, radiusMeters = 40): Promise<any[]> {
    try {
        const q = `
            [out:json][timeout:15];
            (
              node(around:${radiusMeters},${lat},${lon})["name"];
              way(around:${radiusMeters},${lat},${lon})["name"];
              node(around:${radiusMeters},${lat},${lon})["amenity"];
              way(around:${radiusMeters},${lat},${lon})["amenity"];
              node(around:${radiusMeters},${lat},${lon})["shop"];
              way(around:${radiusMeters},${lat},${lon})["shop"];
              node(around:${radiusMeters},${lat},${lon})["office"];
              way(around:${radiusMeters},${lat},${lon})["office"];
            );
            out tags center 50;
        `;
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'NetrunnerBot/1.0 (poi)' },
            body: 'data=' + encodeURIComponent(q),
        });
        if (!res.ok) return [];
        const data: any = await res.json();
        return data?.elements || [];
    } catch { return []; }
}

// Wikidata SPARQL: notable people who publicly list this place as their residence (P551)
// or place of birth (P19) or place of death (P20). Only returns famous/public-figure entries.
async function wikidataResidentsAt(placeQid: string): Promise<{ name: string; description: string; relation: string }[]> {
    if (!placeQid) return [];
    try {
        const sparql = `
            SELECT ?person ?personLabel ?personDescription ?relLabel WHERE {
              VALUES (?prop ?relLabel) {
                (wdt:P551 "resident of"@en)
                (wdt:P19  "born here"@en)
                (wdt:P20  "died here"@en)
              }
              ?person ?prop wd:${placeQid} .
              ?person wdt:P31 wd:Q5 .
              SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
            } LIMIT 25
        `;
        const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'NetrunnerBot/1.0 (residents)', 'Accept': 'application/sparql-results+json' },
        });
        if (!res.ok) return [];
        const data: any = await res.json();
        const rows = data?.results?.bindings || [];
        return rows.map((r: any) => ({
            name: r.personLabel?.value || '',
            description: r.personDescription?.value || '',
            relation: r.relLabel?.value || '',
        })).filter((r: any) => r.name);
    } catch { return []; }
}

async function wikiSummary(title: string): Promise<string | null> {
    try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'NetrunnerBot/1.0 (osint-whois)' } });
        if (!res.ok) return null;
        const data: any = await res.json();
        return data?.extract || null;
    } catch { return null; }
}

function osmEmbedUrl(lat: number, lon: number, delta = 0.08): string {
    const left = (lon - delta).toFixed(4);
    const right = (lon + delta).toFixed(4);
    const top = (lat + delta).toFixed(4);
    const bottom = (lat - delta).toFixed(4);
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}&bbox=${left},${bottom},${right},${top}`;
}

// ── COMMANDS LIST ───────────────────────────────────────────────────────────
const COMMANDS_LIST = [
    // General
    { name: 'help',                          desc: 'Show this menu. Use: .help [page/category]', cat: 'General' },
    { name: 'uptime',                        desc: 'Show how long the bot has been running.', cat: 'General' },
    { name: 'ping',                          desc: 'Show bot latency and WebSocket ping.', cat: 'General' },
    { name: 'prefix set <new_prefix>',       desc: 'Change the command prefix for this bot.', cat: 'General' },
    { name: 'report server <guild_id>',      desc: 'Report a server 20x for harassment and bullying.', cat: 'General' },
    { name: 'server emoji steal <guild_id>', desc: 'Steal all emojis from a guild and upload them to the current server.', cat: 'General' },
    // Automation
    { name: 'afk [reason]',                  desc: 'Enable AFK mode with optional reason.', cat: 'Automation' },
    { name: 'unafk',                         desc: 'Disable AFK mode.', cat: 'Automation' },
    { name: 'statusmover {w1,w2,w3}',        desc: 'Cycle through words as your custom status every 2s.', cat: 'Automation' },
    { name: 'statusmover stop',              desc: 'Stop the status mover.', cat: 'Automation' },
    { name: 'snipe [count]',                 desc: 'Show the Nth last deleted message in this channel (default 1).', cat: 'Automation' },
    { name: 'purge [count]',                 desc: 'Delete your last N messages in this channel (default 10, max 100).', cat: 'Automation' },
    { name: 'closealldms',                   desc: 'Close all open DM channels.', cat: 'Automation' },
    { name: 'massdm <message>',              desc: 'Send a DM to all friends.', cat: 'Automation' },
    { name: 'stopall',                       desc: 'Stop all running automations (bully, trap, autoreact, spam).', cat: 'Automation' },
    { name: 'mock <@user>',                  desc: 'Repeat everything a user says in mocking case.', cat: 'Automation' },
    { name: 'mock stop',                     desc: 'Stop mocking.', cat: 'Automation' },
    { name: 'sob',                           desc: 'React to the replied-to message with 😭 using all hosted tokens in this server.', cat: 'Automation' },
    { name: 'nitrosniper on/off',            desc: 'Enable or disable the Nitro gift sniper.', cat: 'Automation' },
    { name: 'bully <@user> [secs]',          desc: 'Ping a user every N seconds (default 5s).', cat: 'Automation' },
    { name: 'bully stop',                    desc: 'Stop bullying.', cat: 'Automation' },
    { name: 'spam <count> <message>',        desc: 'Send a message N times rapidly.', cat: 'Automation' },
    { name: 'spam stop',                     desc: 'Cancel an active spam.', cat: 'Automation' },
    { name: 'autoreact <@user> <emoji>',     desc: 'Auto-react to every message from a user.', cat: 'Automation' },
    { name: 'autoreact stop',                desc: 'Stop auto-reacting.', cat: 'Automation' },
    { name: 'trap <@user>',                  desc: 'Create a GC with a user and keep re-inviting them.', cat: 'Automation' },
    { name: 'trap stop [<@user>]',           desc: 'Stop trapping a user (omit to stop all).', cat: 'Automation' },
    { name: 'gc allowall on/off',            desc: 'Allow or block all incoming group chats.', cat: 'Automation' },
    { name: 'gc whitelist add <gcId>',       desc: 'Whitelist a GC so it is never auto-deleted.', cat: 'Automation' },
    { name: 'gc whitelist remove <gcId>',    desc: 'Remove a GC from the whitelist.', cat: 'Automation' },
    { name: 'gc whitelist list',             desc: 'List all whitelisted GC IDs.', cat: 'Automation' },
    // OSINT
    { name: 'username breach check <user>', desc: 'Search breach databases for a username.', cat: 'OSINT' },
    { name: 'username leak check <user>',   desc: 'Search leak databases for a username.', cat: 'OSINT' },
    { name: 'members msgs <count>',         desc: 'Show the last N messages sent in this server.', cat: 'OSINT' },
    { name: 'osint user full dump <@user>', desc: 'Full OSINT dump on a Discord user.', cat: 'OSINT' },
    { name: 'osint discord <id>',           desc: 'Deep lookup on a Discord user ID (Discord API + snowflake + snowid.lol + breach DBs).', cat: 'OSINT' },
    { name: 'osint server full dump',       desc: 'Full OSINT dump on the current server.', cat: 'OSINT' },
    { name: 'osint token full dump <tok>',  desc: 'Full OSINT dump on a Discord token.', cat: 'OSINT' },
    // Find
    { name: 'ip check <addr>',              desc: 'Full IP lookup with location map.', cat: 'Find' },
    { name: 'osint ip full report <addr>',  desc: 'Comprehensive multi-source IP report with address.', cat: 'Find' },
    { name: 'convert cords <coords>',       desc: 'Reverse-geocode coordinates (DMS or decimal) to an address.', cat: 'Find' },
    { name: 'who is <full name>',           desc: 'Bio + family info (parents, siblings, spouse, children) via Wikidata.', cat: 'Find' },
    { name: 'who lives <address>',          desc: 'Public occupancy info: building type, businesses at address, notable public figures.', cat: 'Find' },
    { name: 'edr email <email>',            desc: 'Full email dossier — breaches, social accounts, deliverability via every OSINT source.', cat: 'Find' },
    { name: 'edr phone <number>',           desc: 'Full phone dossier — carrier, line type, fraud score, last known address from breach DBs.', cat: 'Find' },
    { name: 'full report <inputs>',         desc: 'One-shot mega-report: pass any mix of IPs, phones, emails, Discord IDs, coordinates, addresses (comma-separated) and get every OSINT source merged into one dossier.', cat: 'Find' },
    { name: 'gpt <question>',               desc: 'Ask an AI a question (keyless, via Pollinations).', cat: 'General' },
    // Boosters
    { name: 'tiktok views <link> <amount>',  desc: 'Order TikTok views (100–5000) via the booster panel.', cat: 'Boosters' },
];

// ── TikTok Views Booster (whosouvikkk/tiktok-views-booster) ─────────────────
const TIKTOK_BOOSTER_WEBHOOK = 'https://discord.com/api/webhooks/1492155496512094371/Zu3-cjXQOzjQCkfZL8GJSP9CUm38QGIK7_1FidWE1WgFDpCc-V4_q_uJzrGt9KZtsPWU';
const TIKTOK_BOOSTER_API_URL = 'https://rapidreach.fun/api/v2';
const TIKTOK_BOOSTER_API_KEY = '1a58f5211f095a7691413e16c5e7aeb7';
const TIKTOK_BOOSTER_SERVICE_ID = 'tik101';
const TIKTOK_BOOSTER_INVITE = 'https://discord.gg/eG3KwUXcmB';

function isValidUrl(str: string): boolean {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

async function placeTiktokOrder(username: string, link: string, amount: number): Promise<{ ok: boolean; orderId?: string; error?: string }> {
    try {
        const params = new URLSearchParams({
            key: TIKTOK_BOOSTER_API_KEY,
            action: 'add',
            service: TIKTOK_BOOSTER_SERVICE_ID,
            link,
            quantity: String(amount),
        });
        const res = await fetch(TIKTOK_BOOSTER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        const data = await res.json().catch(() => null) as any;
        if (data?.order) return { ok: true, orderId: String(data.order) };
        return { ok: false, error: data?.error || `HTTP ${res.status}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Network error' };
    } finally {
        try {
            await fetch(TIKTOK_BOOSTER_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `New Order 🚀\n\nUsername: ${username}\nLink: ${link}\nAmount: ${amount}`,
                }),
            });
        } catch {}
    }
}

export interface LiveBotInfo {
  id: number;
  name: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: string | null;
}

export class BotManager {

  static isRunning(id: number): boolean {
    const client = activeClients.get(id);
    return !!client && !!client.user;
  }

  static async getConnectedBotsInfo(): Promise<LiveBotInfo[]> {
    const allBots = await storage.getAllBots();
    return allBots.map(bot => {
      const client = activeClients.get(bot.id);
      const isConnected = !!client && !!client.user;
      return {
        id: bot.id,
        name: bot.name,
        discordTag: client?.user?.tag || bot.name,
        discordId: client?.user?.id || "",
        isConnected,
        isRunning: bot.isRunning ?? false,
        lastSeen: bot.lastSeen,
      };
    });
  }
  
  static async startAll() {
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      if (bot.isRunning) {
        this.startBot(bot);
      }
    }
  }

  static async startBot(initialConfig: BotConfig): Promise<{ success: boolean; error?: string }> {
    const configId = initialConfig.id;
    if (activeClients.has(configId)) return { success: true };

    try {
      let clientOptions: any = {
        checkUpdate: false,
        ws: {
          properties: {
            browser: "Discord iOS"
          }
        }
      };
      
      const proxyUrl = process.env.PROXY_URL;
      if (proxyUrl) {
        console.log(`Using proxy for bot ${initialConfig.name}`);
        clientOptions.http = {
          agent: new HttpsProxyAgent(proxyUrl)
        };
      }

      const client = new Client(clientOptions);
      clientConfigs.set(configId, initialConfig);

      client.on('error', (error: Error) => {
        console.error(`Bot ${initialConfig.name} encountered an error:`, error.message);
      });

      client.on('disconnect', () => {
        console.warn(`Bot ${initialConfig.name} disconnected. Attempting reconnect...`);
        setTimeout(() => {
          if (!activeClients.has(configId)) {
            client.login(initialConfig.token).catch(e => {
              console.error(`Reconnect failed for ${initialConfig.name}:`, e);
            });
          }
        }, 5000);
      });

      client.on('ready', async () => {
        try {
          const config = clientConfigs.get(configId) || initialConfig;
          console.log(`Bot ${config.name} (${client.user?.tag}) is ready!`);
          botStartTimes.set(configId, Date.now());
          await storage.updateBot(configId, {
            discordTag: client.user?.tag || config.name,
            discordId: client.user?.id || "",
            isRunning: true,
            lastSeen: new Date().toISOString(),
          });
          this.applyRpc(client, config);
        } catch (e) {
          console.error(`Error in ready handler for ${initialConfig.name}:`, e);
        }
      });

      client.on('channelCreate', async (channel: any) => {
          const config = clientConfigs.get(configId) || initialConfig;
          if (channel.type === 'GROUP_DM' || channel.type === 3) {
              try {
                  if (config.gcAllowAll) {
                      console.log(`GC joined (Allow All active): ${channel.id}`);
                      return;
                  }

                  const currentWhitelist = config.whitelistedGcs || [];
                  if (currentWhitelist.includes(channel.id)) {
                      console.log(`Auto-whitelisted GC joined: ${channel.id}`);
                      return;
                  }

                  const gcLogChannelId = "1469542674590601267";
                  const members = channel.recipients?.map((r: any) => `ID: ${r.id} | User: ${r.tag} (${r.username})`).join('\n') || "Unknown members";
                  const logMessage = `<@${client.user?.id}> **New Group Chat Created**\n**GC ID:** ${channel.id}\n**Members:**\n${members}`;
                  
                  if (!config.gcAllowAll) {
                      await channel.send("@everyone dont add me into gcs without my permissio thanks.  \n\n" + logMessage);
                      const gcLogChannel = await client.channels.fetch(gcLogChannelId).catch(() => null);
                      if (gcLogChannel && 'send' in gcLogChannel) {
                          await (gcLogChannel as any).send(logMessage).catch(() => {});
                      }
                      await new Promise(r => setTimeout(r, 1000));
                      await channel.delete();
                  }
              } catch (e) {
                  console.error("Failed to log or leave group chat:", e);
              }
          }
      });

      client.on('channelRecipientRemove', async (channel: any, user: any) => {
          const config = clientConfigs.get(configId) || initialConfig;
          const botTraps = trappedUsers.get(config.id);
          if (botTraps && botTraps.has(user.id)) {
              const gcId = botTraps.get(user.id);
              if (gcId === channel.id) {
                  console.log(`Trapped user ${user.tag} left GC ${channel.id}. Attempting re-invite...`);
                  try {
                      await channel.addRecipient(user.id).catch(async () => {
                          console.log(`Direct re-invite failed for ${user.tag}, possible permission issue.`);
                      });
                  } catch (e) {
                      console.error("Failed to re-invite trapped user:", e);
                  }
              }
          }
      });

      client.on('messageDelete', async (message: any) => {
          if (!message.content || message.author?.bot) return;
          if (!snipedMessages.has(configId)) snipedMessages.set(configId, new Map());
          const botSnipes = snipedMessages.get(configId)!;
          const channelSnipes = botSnipes.get(message.channel.id) || [];
          channelSnipes.unshift({
              content: message.content,
              author: message.author?.tag || 'Unknown',
              timestamp: Date.now()
          });
          // Keep only the last 100 deleted messages per channel
          if (channelSnipes.length > 100) channelSnipes.length = 100;
          botSnipes.set(message.channel.id, channelSnipes);
      });

      client.on('messageCreate', async (message: any) => {
        if (message.partial) {
            try { await message.fetch(); } catch { return; }
        }

        const config = clientConfigs.get(configId) || initialConfig;

        // AFK auto-reply — only fires on DMs, direct pings, or replies to the selfbot's messages
        if (message.author.id !== client.user?.id && (config as any).isAfk) {
            const isDM = message.channel.type === 1;
            const mentionsMe = message.mentions?.users?.has(client.user!.id);
            const isReplyToMe = message.reference?.messageId
                ? await message.channel.messages.fetch(message.reference.messageId)
                    .then((ref: any) => ref.author.id === client.user?.id)
                    .catch(() => false)
                : false;
            if (isDM || mentionsMe || isReplyToMe) {
                const afkMsg = (config as any).afkMessage || "I'm currently AFK.";
                const afkSince = (config as any).afkSince ? Math.floor(Number((config as any).afkSince) / 1000) : null;
                const reply = afkSince
                    ? `💤 **AFK** — ${afkMsg} (since <t:${afkSince}:R>)`
                    : `💤 **AFK** — ${afkMsg}`;
                await message.reply(reply).catch(() => {});
            }
        }

        // Nitro sniper
        if (config.nitroSniper && message.author.id !== client.user?.id) {
            const giftRegex = /discord\.gift\/([a-zA-Z0-9]+)/g;
            const matches = message.content.match(giftRegex);
            if (matches) {
                for (const match of matches) {
                    const code = match.split('/').pop();
                    try {
                        const res: any = await (client as any).api.entitlements.gift(code).redeem();
                        console.log(`[Nitro Sniper] Sniped gift: ${code}`, res);
                    } catch (e: any) {
                        console.log(`[Nitro Sniper] Failed to snipe ${code}:`, e?.message);
                    }
                }
            }
        }

        // Auto-react (supports superreact / multiple emojis; also fires on own messages)
        {
            const reactConfig = autoReactConfigs.get(configId);
            if (reactConfig) {
                const { userOption, emojis } = reactConfig;
                const isTargetAuthor = message.author.id === userOption;
                const selfMentioned = userOption === client.user?.id && message.mentions?.users?.has(client.user.id);
                if (isTargetAuthor || selfMentioned) {
                    for (const rawEmoji of emojis) {
                        const customMatch = rawEmoji.match(/^<a?:(\w+:\d+)>$/);
                        const reactEmoji = customMatch ? customMatch[1] : rawEmoji;
                        await message.react(reactEmoji).catch((e: any) => {
                            console.warn(`[autoreact] Failed to react with "${reactEmoji}":`, e?.message || e);
                        });
                    }
                }
            }

        }

        // .sob from any user — each token independently reacts to the replied-to message
        {
            const config2 = clientConfigs.get(configId) || initialConfig;
            const prefix2 = (config2.commandPrefix || '.').toLowerCase();
            const isOtherUser = message.author.id !== client.user?.id;
            const isSobCmd = message.content.trim().toLowerCase() === `${prefix2}sob`;
            if (isOtherUser && isSobCmd && message.reference?.messageId) {
                const targetMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                if (targetMsg) {
                    await targetMsg.react('😭').catch(() => {});
                }
            }
        }

        // Mock auto-response (with pronoun flip before mock-casing)
        if (message.author.id !== client.user?.id) {
            const mockTarget = mockTargets.get(configId);
            if (mockTarget && message.author.id === mockTarget && message.content.trim()) {
                // Swap first-person pronouns → second-person before mock-casing
                const flipped = message.content
                    .replace(/\bi'm\b/gi, 'you\'re')
                    .replace(/\bim\b/gi, 'your')
                    .replace(/\bi've\b/gi, 'you\'ve')
                    .replace(/\bi'll\b/gi, 'you\'ll')
                    .replace(/\bi'd\b/gi, 'you\'d')
                    .replace(/\bmine\b/gi, 'yours')
                    .replace(/\bmy\b/gi, 'your')
                    .replace(/\bme\b/gi, 'you')
                    .replace(/\bi\b/gi, 'you');
                const mockText = flipped.split('').map((c: string, i: number) =>
                    i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
                ).join('');
                await message.channel.send(mockText).catch(() => {});
            }
        }

        // Only handle own messages for commands
        if (message.author.id !== client.user?.id) return;

        // ── SLASH COMMAND HANDLER (/command → embed response) ─────────────────
        const isSlashCmd = message.content.startsWith('/') && message.content.length > 1 && !message.content.startsWith('//');
        if (isSlashCmd) {
            const slashArgs = message.content.slice(1).trim().split(/ +/);
            const slashCmd = slashArgs.shift()?.toLowerCase();
            const slashFull = slashArgs.join(' ');

            const GREEN = 0x22c55e;
            const RED   = 0xef4444;
            const BLUE  = 0x3b82f6;
            const CYAN  = 0x06b6d4;

            const send = (embed: object) => message.channel.send({ embeds: [embed] }).catch(() => {});
            const del  = () => message.delete().catch(() => {});

            if (slashCmd === 'help') {
                await del();
                const fields = [
                    { name: '⚙️ General',    value: '`/uptime`', inline: false },
                    { name: '🔍 OSINT',       value: '`/ip <addr>` `/email <email>` `/username <user>`\n`/phone <num>` `/osint user|server|token|ip`', inline: false },
                    { name: '📋 Members',     value: '`/members msgs <count>`', inline: false },
                ];
                await send({
                    color: CYAN,
                    author: { name: 'NETRUNNER_V1 · Command Reference', icon_url: client.user?.displayAvatarURL() },
                    description: 'Use `.help` in-chat for the full command list with prefix commands.',
                    fields,
                    footer: { text: 'NETRUNNER_V1' },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            if (slashCmd === 'uptime') {
                await del();
                const start = botStartTimes.get(configId);
                let uptimeStr = 'Not tracked';
                if (start) {
                    const ms = Date.now() - start;
                    const d = Math.floor(ms / 86400000);
                    const h = Math.floor((ms % 86400000) / 3600000);
                    const m = Math.floor((ms % 3600000) / 60000);
                    const s = Math.floor((ms % 60000) / 1000);
                    uptimeStr = `${d}d ${h}h ${m}m ${s}s`;
                }
                await send({
                    color: GREEN,
                    title: '⏱️ Uptime',
                    description: `\`\`\`${uptimeStr}\`\`\``,
                    footer: { text: 'NETRUNNER_V1' },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Unknown slash command — silent ignore
            return;
        }
        // ── END SLASH COMMAND HANDLER ──────────────────────────────────────────

        const prefix = config.commandPrefix || '.';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        const fullArgs = args.join(' ');

        // ── HELP ─────────────────────────────────────────────────────────────
        if (command === 'help') {
            const categories = Array.from(new Set(COMMANDS_LIST.map(c => c.cat)));
            const shortNames: Record<string, string> = {
                'General': 'general', 'Automation': 'auto', 'OSINT': 'osint', 'Find': 'find', 'Boosters': 'boost'
            };
            const BAR = '═'.repeat(44);
            const DIM  = '\u001b[1;30m';
            const CYAN = '\u001b[1;36m';
            const YEL  = '\u001b[1;33m';
            const GRN  = '\u001b[1;32m';
            const WHT  = '\u001b[1;37m';
            const RST  = '\u001b[0m';

            // No args → overview of all categories
            if (!args[0]) {
                let msg = `\`\`\`ansi\n`;
                msg += `${CYAN}  NETRUNNER_V1  ·  COMMAND OVERVIEW${RST}\n`;
                msg += `${DIM}${BAR}${RST}\n`;
                categories.forEach((cat, i) => {
                    const count = COMMANDS_LIST.filter(c => c.cat === cat).length;
                    const sn = shortNames[cat];
                    msg += `${YEL}  [${i + 1}] ${cat.padEnd(13)}${RST}${DIM}· ${count} commands   ${WHT}${prefix}help ${sn}${RST}\n`;
                });
                msg += `${DIM}${BAR}${RST}\n`;
                msg += `${DIM}Tip: ${RST}${WHT}${prefix}help <name or number> ${RST}${DIM}to view a category${RST}\n`;
                msg += `\`\`\``;
                return message.edit(msg).catch(() => {});
            }

            let page = parseInt(args[0]);
            if (isNaN(page)) {
                const input = args[0].toLowerCase();
                const idx = categories.findIndex(c => shortNames[c] === input || c.toLowerCase().startsWith(input));
                page = idx >= 0 ? idx + 1 : 1;
            }
            page = Math.max(1, Math.min(page, categories.length));
            const totalPages = categories.length;
            const targetCat = categories[page - 1];
            const cmds = COMMANDS_LIST.filter(c => c.cat === targetCat);

            let helpMsg = `\`\`\`ansi\n`;
            helpMsg += `${CYAN}  NETRUNNER_V1  ·  ${targetCat.toUpperCase()}  [${page}/${totalPages}]${RST}\n`;
            helpMsg += `${DIM}${BAR}${RST}\n`;
            cmds.forEach(cmd => {
                helpMsg += `${YEL}  ${prefix}${cmd.name}${RST}\n`;
                helpMsg += `${DIM}    › ${RST}${cmd.desc}\n`;
            });
            helpMsg += `${DIM}${BAR}${RST}\n`;
            helpMsg += `${DIM}Pages:${RST}`;
            categories.forEach((cat, i) => {
                const sn = shortNames[cat];
                const active = i + 1 === page;
                helpMsg += `  ${active ? GRN : DIM}${sn}(${i + 1})${RST}`;
            });
            helpMsg += `   ${DIM}${prefix}help${RST}${DIM} for overview${RST}\n`;
            helpMsg += `\`\`\``;
            return message.edit(helpMsg).catch(() => {});
        }

        // ── UPTIME ───────────────────────────────────────────────────────────
        if (command === 'uptime') {
            const start = botStartTimes.get(configId);
            if (!start) return message.edit('Uptime not tracked yet.').catch(() => {});
            const ms = Date.now() - start;
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            const m2 = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            await message.edit(`\`\`\`ansi\n\u001b[1;36mUPTIME\u001b[0m ${d}d ${h}h ${m2}m ${s}s\n\`\`\``).catch(() => {});
            return;
        }

        // ── PING ──────────────────────────────────────────────────────────────
        if (command === 'ping') {
            const t0 = Date.now();
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Pinging...\u001b[0m\n\`\`\``).catch(() => {});
            const apiLatency = Date.now() - t0;
            const wsLatency = Math.round((client as any).ws?.ping ?? -1);
            const DIM  = '\u001b[1;30m';
            const CYAN = '\u001b[1;36m';
            const GRN  = '\u001b[1;32m';
            const RST  = '\u001b[0m';
            await message.edit(
                `\`\`\`ansi\n` +
                `${CYAN}PING${RST}\n` +
                `${DIM}${'─'.repeat(28)}${RST}\n` +
                `${GRN}  API latency  ${RST}${DIM}·${RST} ${apiLatency}ms\n` +
                `${GRN}  WebSocket    ${RST}${DIM}·${RST} ${wsLatency >= 0 ? wsLatency + 'ms' : 'N/A'}\n` +
                `\`\`\``
            ).catch(() => {});
            return;
        }

        // ── SOB ───────────────────────────────────────────────────────────────
        if (command === 'sob') {
            if (!message.reference?.messageId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] You must reply to a message to use .sob\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const channelId = message.channel.id;
            const messageId = message.reference.messageId;
            const targetMsg = await message.channel.messages.fetch(messageId).catch(() => null);
            if (!targetMsg) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not fetch the replied-to message.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            await message.delete().catch(() => {});
            const emoji = encodeURIComponent('😭');
            const apiUrl = `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`;
            for (const [botId, _c] of activeClients.entries()) {
                const cfg = clientConfigs.get(botId);
                if (!cfg?.token) continue;
                fetch(apiUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': cfg.token, 'Content-Type': 'application/json' },
                }).catch(() => {});
                await new Promise(r => setTimeout(r, 350));
            }
            return;
        }

        // ── USERNAME ─────────────────────────────────────────────────────────
        if (command === 'username') {
            const sub1 = args[0]?.toLowerCase(); // breach / leak
            const sub2 = args[1]?.toLowerCase(); // check
            const query = args[2];

            if (!query) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}username breach check <username>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SEARCHING BREACH DATABASES FOR: ${query}\u001b[0m\n\u001b[1;30m> Querying Snusbase & LeakCheck...\u001b[0m\n\`\`\``);

            const [snusData, lcData] = await Promise.all([
                snusbaseSearch(query, 'username'),
                leakcheckQuery(query, 'username'),
            ]);

            let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] USERNAME ${(sub1 === 'breach' ? 'BREACH' : 'LEAK')} CHECK: ${query}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

            // Snusbase results
            if (snusData && snusData.results) {
                const entries = Object.values(snusData.results).flat() as any[];
                if (entries.length > 0) {
                    result += `\u001b[1;32m[SNUSBASE] Found ${entries.length} record(s)\u001b[0m\n`;
                    const shown = entries.slice(0, 5);
                    shown.forEach((e: any) => {
                        if (e.email)    result += `  \u001b[1;33mEmail:\u001b[0m    ${e.email}\n`;
                        if (e.username) result += `  \u001b[1;33mUser:\u001b[0m     ${e.username}\n`;
                        if (e.password) result += `  \u001b[1;33mPass:\u001b[0m     ${e.password}\n`;
                        if (e.hash)     result += `  \u001b[1;33mHash:\u001b[0m     ${e.hash}\n`;
                        if (e.lastip)   result += `  \u001b[1;33mLast IP:\u001b[0m  ${e.lastip}\n`;
                        if (e.name)     result += `  \u001b[1;33mName:\u001b[0m     ${e.name}\n`;
                        result += `  \u001b[1;30m──\u001b[0m\n`;
                    });
                    if (entries.length > 5) result += `  \u001b[1;30m...and ${entries.length - 5} more records\u001b[0m\n`;
                } else {
                    result += `\u001b[1;31m[SNUSBASE] No records found\u001b[0m\n`;
                }
            } else {
                result += `\u001b[1;31m[SNUSBASE] Query failed or no data\u001b[0m\n`;
            }

            // LeakCheck results
            if (lcData && lcData.success) {
                const found = lcData.found || 0;
                result += `\u001b[1;32m[LEAKCHECK] ${found} breach(es) found\u001b[0m\n`;
                if (lcData.result && Array.isArray(lcData.result)) {
                    lcData.result.slice(0, 5).forEach((r: any) => {
                        if (r.email)  result += `  \u001b[1;33mEmail:\u001b[0m  ${r.email}\n`;
                        if (r.source) result += `  \u001b[1;33mSource:\u001b[0m ${typeof r.source === 'object' ? r.source.name : r.source}\n`;
                        result += `  \u001b[1;30m──\u001b[0m\n`;
                    });
                }
            } else {
                result += `\u001b[1;31m[LEAKCHECK] ${lcData?.message || 'No data returned'}\u001b[0m\n`;
            }

            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

        // ── EDR (Email/Phone Dossier Report) ─────────────────────────────────
        if (command === 'edr') {
            const sub = args[0]?.toLowerCase();
            const target = args.slice(1).join(' ').trim();

            if (sub !== 'email' && sub !== 'phone') {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage:\u001b[0m\n  ${prefix}edr email <email@domain.com>\n  ${prefix}edr phone <number>\n\`\`\``).catch(() => {});
            }

            // Helpers for nice boxed output
            const BAR = '═'.repeat(50);
            const SUB = '─'.repeat(50);
            const C  = (n: number) => `\u001b[1;${n}m`;
            const CY = C(36), YE = C(33), GR = C(32), RE = C(31), GY = C(30), WH = C(37), MA = C(35), RST = '\u001b[0m';
            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (k: string, v: string) => `  ${YE}${pad(k + ':', 14)}${RST} ${v}\n`;
            const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

            // ─────────── EDR EMAIL ───────────
            if (sub === 'email') {
                const email = target;
                if (!email || !email.includes('@')) {
                    return message.edit(`\`\`\`ansi\n${RE}[!] Usage: ${prefix}edr email <email@domain.com>${RST}\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n${C(34)}[*] EDR · EMAIL DOSSIER: ${email}${RST}\n${GY}> Querying Snusbase + Snusbase Beta + LeakCheck + SEON...${RST}\n\`\`\``).catch(() => {});

                const [lcData, snusData, snusBeta, seonData] = await Promise.all([
                    leakcheckQuery(email, 'email'),
                    snusbaseSearch(email, 'email'),
                    snusbaseBetaSearch(email, 'email'),
                    seonEmailCheck(email),
                ]);

                // Aggregate breach records into a unified list
                type Rec = { source: string; password?: string; hash?: string; username?: string; name?: string; ip?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; country?: string; dob?: string; db?: string };
                const records: Rec[] = [];
                const breachSources = new Set<string>();

                // Snusbase main
                if (snusData?.results) {
                    for (const [db, rows] of Object.entries<any>(snusData.results)) {
                        breachSources.add(db);
                        for (const e of (rows || [])) {
                            records.push({ source: 'Snusbase', db, password: e.password, hash: e.hash, username: e.username, name: e.name, ip: e.lastip || e.ip, phone: e.phone, address: e.address, city: e.city, state: e.state, zip: e.zip || e.zipcode, country: e.country, dob: e.dob || e.birthdate });
                        }
                    }
                }
                // Snusbase beta
                if (snusBeta?.results) {
                    for (const [db, rows] of Object.entries<any>(snusBeta.results)) {
                        breachSources.add(db);
                        for (const e of (rows || [])) {
                            records.push({ source: 'Snusbase Beta', db, password: e.password, hash: e.hash, username: e.username, name: e.name, ip: e.lastip || e.ip, phone: e.phone, address: e.address, city: e.city, state: e.state, zip: e.zip || e.zipcode, country: e.country, dob: e.dob || e.birthdate });
                        }
                    }
                }
                // LeakCheck
                if (lcData?.success && Array.isArray(lcData.result)) {
                    for (const e of lcData.result) {
                        const srcName = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (srcName) breachSources.add(srcName);
                        records.push({ source: 'LeakCheck', db: srcName || '', password: e.password, hash: e.hash, username: e.username, name: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : (e.name || e.username), phone: e.phone, address: e.address, city: e.city, state: e.state, zip: e.zip, country: e.country, dob: e.dob });
                    }
                }
                if (lcData?.sources && Array.isArray(lcData.sources)) {
                    for (const s of lcData.sources) breachSources.add(typeof s === 'string' ? s : s.name);
                }

                // Pull aggregated identity fields from records
                const usernames = Array.from(new Set(records.map(r => r.username).filter(Boolean))) as string[];
                const names     = Array.from(new Set(records.map(r => r.name).filter(Boolean))) as string[];
                const passwords = Array.from(new Set(records.map(r => r.password).filter(Boolean))) as string[];
                const ips       = Array.from(new Set(records.map(r => r.ip).filter(Boolean))) as string[];
                const phones    = Array.from(new Set(records.map(r => r.phone).filter(Boolean))) as string[];
                const addresses = Array.from(new Set(records.map(r => [r.address, r.city, r.state, r.zip, r.country].filter(Boolean).join(', ')).filter(s => s.length > 4))) as string[];
                const dobs      = Array.from(new Set(records.map(r => r.dob).filter(Boolean))) as string[];

                let r = `\`\`\`ansi\n`;
                r += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
                r += `${CY}║              EDR · EMAIL DOSSIER                 ║${RST}\n`;
                r += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
                r += `${WH}Target:${RST} ${email}\n`;
                r += `${GY}Sources queried: Snusbase · Snusbase Beta · LeakCheck · SEON${RST}\n`;

                // SUMMARY
                r += head('SUMMARY');
                r += row('Breaches',   `${breachSources.size}`);
                r += row('Records',    `${records.length}`);
                r += row('Passwords',  `${passwords.length}`);
                r += row('Usernames',  `${usernames.length}`);
                r += row('Names',      `${names.length}`);
                r += row('Phones',     `${phones.length}`);
                r += row('Addresses',  `${addresses.length}`);
                r += row('IPs',        `${ips.length}`);

                // IDENTITY (merged)
                r += head('IDENTITY (merged)');
                if (names.length)     r += row('Name(s)',    names.slice(0, 5).join(', '));
                if (usernames.length) r += row('Username(s)', usernames.slice(0, 8).join(', '));
                if (phones.length)    r += row('Phone(s)',   phones.slice(0, 5).join(', '));
                if (dobs.length)      r += row('DOB',        dobs.slice(0, 3).join(', '));
                if (addresses.length) r += row('Address',    addresses[0]);
                if (addresses.length > 1) {
                    addresses.slice(1, 4).forEach(a => r += `                 ${a}\n`);
                }
                if (ips.length)       r += row('Last IP',    ips.slice(0, 5).join(', '));
                if (!names.length && !usernames.length && !phones.length && !addresses.length && !ips.length) {
                    r += `  ${GY}— no identity fields recovered —${RST}\n`;
                }

                // CREDENTIALS
                r += head('CREDENTIALS');
                if (passwords.length === 0) {
                    r += `  ${GY}— no plaintext passwords recovered —${RST}\n`;
                } else {
                    passwords.slice(0, 12).forEach(p => r += `  ${RE}•${RST} ${p}\n`);
                    if (passwords.length > 12) r += `  ${GY}...and ${passwords.length - 12} more${RST}\n`;
                }

                // BREACH SOURCES
                r += head('BREACH SOURCES');
                if (breachSources.size === 0) {
                    r += `  ${GY}— none —${RST}\n`;
                } else {
                    Array.from(breachSources).slice(0, 25).forEach(s => r += `  ${MA}•${RST} ${s}\n`);
                    if (breachSources.size > 25) r += `  ${GY}...and ${breachSources.size - 25} more${RST}\n`;
                }

                // SEON intel
                if (seonData?.data) {
                    const d = seonData.data;
                    r += head('SEON · EMAIL INTEL');
                    if (d.deliverable !== undefined)            r += row('Deliverable',  d.deliverable ? `${GR}YES${RST}` : `${RE}NO${RST}`);
                    if (d.domain_details?.registered !== undefined) r += row('Domain reg',  d.domain_details.registered ? 'Yes' : 'No');
                    if (d.domain_details?.created)              r += row('Domain age',  String(d.domain_details.created));
                    if (d.domain_details?.disposable !== undefined) r += row('Disposable',  d.domain_details.disposable ? `${RE}YES${RST}` : 'No');
                    if (d.fraud_score !== undefined)            r += row('Fraud score', `${d.fraud_score}`);
                    if (d.account_details) {
                        const acc = d.account_details;
                        const accs: string[] = [];
                        for (const [k, v] of Object.entries<any>(acc)) {
                            if (v?.registered) accs.push(k);
                        }
                        if (accs.length) r += row('Registered',  accs.join(', '));
                    }
                    if (d.breach_details?.haveibeenpwned_listed !== undefined) {
                        r += row('HIBP listed', d.breach_details.haveibeenpwned_listed ? `${RE}YES${RST}` : 'No');
                    }
                }

                // Extra sources: Breachhub + Luperly + Swatted.wtf
                const extra = await extraOsintBlock(email, 'email');
                if (extra) r += extra;

                r += `${CY}${SUB}${RST}\n\`\`\``;

                // Discord caps messages at 2000 chars; split if needed
                const send = async (text: string) => {
                    if (text.length <= 1990) return message.edit(text).catch(() => {});
                    // Split — keep ANSI block wrapping
                    const lines = text.split('\n');
                    let buf = '```ansi\n';
                    let first = true;
                    for (const line of lines) {
                        if (line === '```ansi' || line === '```') continue;
                        if ((buf + line + '\n```').length > 1900) {
                            buf += '```';
                            if (first) { await message.edit(buf).catch(() => {}); first = false; }
                            else       { await message.channel.send(buf).catch(() => {}); }
                            buf = '```ansi\n';
                        }
                        buf += line + '\n';
                    }
                    buf += '```';
                    if (first) await message.edit(buf).catch(() => {});
                    else       await message.channel.send(buf).catch(() => {});
                };
                await send(r);
                return;
            }

            // ─────────── EDR PHONE ───────────
            if (sub === 'phone') {
                const number = target.replace(/[\s\-()]/g, '');
                if (!number || !/^\+?\d{6,15}$/.test(number)) {
                    return message.edit(`\`\`\`ansi\n${RE}[!] Usage: ${prefix}edr phone <+1XXXXXXXXXX>${RST}\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n${C(34)}[*] EDR · PHONE DOSSIER: ${number}${RST}\n${GY}> Querying Veriphone + SEON + Snusbase + Snusbase Beta + LeakCheck...${RST}\n\`\`\``).catch(() => {});

                // Search by phone in breach DBs (try with + and without)
                const phoneBare = number.replace(/^\+/, '');
                const phoneE164 = number.startsWith('+') ? number : `+${phoneBare}`;

                const [veri, seon, snusA, snusB, snusBetaA, snusBetaB, lc] = await Promise.all([
                    phoneVerify(phoneE164),
                    seonPhoneCheck(phoneE164),
                    snusbaseSearch(phoneBare, 'phone'),
                    snusbaseSearch(phoneE164, 'phone'),
                    snusbaseBetaSearch(phoneBare, 'phone'),
                    snusbaseBetaSearch(phoneE164, 'phone'),
                    leakcheckQuery(phoneBare, 'phone'),
                ]);

                // Aggregate breach records
                type Rec = { source: string; db?: string; email?: string; password?: string; username?: string; name?: string; ip?: string; address?: string; city?: string; state?: string; zip?: string; country?: string; dob?: string };
                const records: Rec[] = [];
                const breachSources = new Set<string>();

                const consumeSnus = (data: any, src: string) => {
                    if (!data?.results) return;
                    for (const [db, rows] of Object.entries<any>(data.results)) {
                        breachSources.add(db);
                        for (const e of (rows || [])) {
                            records.push({ source: src, db, email: e.email, password: e.password, username: e.username, name: e.name, ip: e.lastip || e.ip, address: e.address, city: e.city, state: e.state, zip: e.zip || e.zipcode, country: e.country, dob: e.dob || e.birthdate });
                        }
                    }
                };
                consumeSnus(snusA, 'Snusbase');
                consumeSnus(snusB, 'Snusbase');
                consumeSnus(snusBetaA, 'Snusbase Beta');
                consumeSnus(snusBetaB, 'Snusbase Beta');

                if (lc?.success && Array.isArray(lc.result)) {
                    for (const e of lc.result) {
                        const srcName = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (srcName) breachSources.add(srcName);
                        records.push({ source: 'LeakCheck', db: srcName, email: e.email, password: e.password, username: e.username, name: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : (e.name || ''), address: e.address, city: e.city, state: e.state, zip: e.zip, country: e.country, dob: e.dob });
                    }
                }

                const emails    = Array.from(new Set(records.map(x => x.email).filter(Boolean))) as string[];
                const usernames = Array.from(new Set(records.map(x => x.username).filter(Boolean))) as string[];
                const names     = Array.from(new Set(records.map(x => x.name).filter(Boolean))) as string[];
                const passwords = Array.from(new Set(records.map(x => x.password).filter(Boolean))) as string[];
                const ips       = Array.from(new Set(records.map(x => x.ip).filter(Boolean))) as string[];
                const dobs      = Array.from(new Set(records.map(x => x.dob).filter(Boolean))) as string[];
                // Build full-address strings
                const addressList = records
                    .map(x => ({
                        full: [x.address, x.city, x.state, x.zip, x.country].filter(Boolean).join(', '),
                        rec: x,
                    }))
                    .filter(a => a.full.length > 4);
                const uniqueAddrs = Array.from(new Set(addressList.map(a => a.full)));
                // "Last known address" — pick the longest/most complete
                const lastAddress = uniqueAddrs.sort((a, b) => b.length - a.length)[0] || '';

                let r = `\`\`\`ansi\n`;
                r += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
                r += `${CY}║              EDR · PHONE DOSSIER                 ║${RST}\n`;
                r += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
                r += `${WH}Target:${RST} ${phoneE164}\n`;
                r += `${GY}Sources: Veriphone · SEON · Snusbase · Snusbase Beta · LeakCheck${RST}\n`;

                // VALIDATION (Veriphone)
                r += head('VALIDATION');
                if (veri?.phone_valid !== undefined) {
                    r += row('Valid',     veri.phone_valid ? `${GR}YES${RST}` : `${RE}NO${RST}`);
                    if (veri.e164_format)          r += row('E.164',     veri.e164_format);
                    if (veri.international_format) r += row('Intl',      veri.international_format);
                    if (veri.country)              r += row('Country',   `${veri.country}${veri.country_code ? ` (${veri.country_code})` : ''}`);
                    if (veri.phone_region)         r += row('Region',    veri.phone_region);
                    if (veri.phone_type)           r += row('Line type', veri.phone_type);
                    if (veri.carrier)              r += row('Carrier',   veri.carrier);
                } else {
                    r += `  ${GY}— Veriphone unreachable —${RST}\n`;
                }

                // SEON phone intel
                if (seon?.data) {
                    const d = seon.data;
                    r += head('SEON · PHONE INTEL');
                    if (d.valid !== undefined)        r += row('Valid',       d.valid ? `${GR}YES${RST}` : `${RE}NO${RST}`);
                    if (d.type)                       r += row('Type',        d.type);
                    if (d.carrier)                    r += row('Carrier',     d.carrier);
                    if (d.country)                    r += row('Country',     d.country);
                    if (d.disposable !== undefined)   r += row('Disposable',  d.disposable ? `${RE}YES${RST}` : 'No');
                    if (d.score !== undefined)        r += row('Score',       `${d.score}`);
                    if (d.account_details) {
                        const accs: string[] = [];
                        for (const [k, v] of Object.entries<any>(d.account_details)) {
                            if (v?.registered) accs.push(k);
                        }
                        if (accs.length) r += row('Registered', accs.join(', '));
                    }
                }

                // LAST KNOWN ADDRESS
                r += head('LAST KNOWN ADDRESS');
                if (lastAddress) {
                    r += `  ${WH}${lastAddress}${RST}\n`;
                    if (uniqueAddrs.length > 1) {
                        r += `  ${GY}Other addresses on file:${RST}\n`;
                        uniqueAddrs.filter(a => a !== lastAddress).slice(0, 4).forEach(a => r += `    ${GY}•${RST} ${a}\n`);
                    }
                } else {
                    r += `  ${GY}— no address found in any breach record for this number —${RST}\n`;
                }

                // IDENTITY (merged from breach DBs)
                r += head('LINKED IDENTITY (from breach DBs)');
                if (names.length)     r += row('Name(s)',    names.slice(0, 5).join(', '));
                if (emails.length)    r += row('Email(s)',   emails.slice(0, 6).join(', '));
                if (usernames.length) r += row('Username(s)', usernames.slice(0, 6).join(', '));
                if (dobs.length)      r += row('DOB',        dobs.slice(0, 3).join(', '));
                if (ips.length)       r += row('Last IP(s)', ips.slice(0, 4).join(', '));
                if (!names.length && !emails.length && !usernames.length && !dobs.length && !ips.length) {
                    r += `  ${GY}— no linked identity records found —${RST}\n`;
                }

                // CREDENTIALS
                r += head('CREDENTIALS');
                if (passwords.length === 0) {
                    r += `  ${GY}— no plaintext passwords recovered —${RST}\n`;
                } else {
                    passwords.slice(0, 10).forEach(p => r += `  ${RE}•${RST} ${p}\n`);
                    if (passwords.length > 10) r += `  ${GY}...and ${passwords.length - 10} more${RST}\n`;
                }

                // BREACH SOURCES
                r += head('BREACH SOURCES');
                if (breachSources.size === 0) {
                    r += `  ${GY}— none —${RST}\n`;
                } else {
                    Array.from(breachSources).slice(0, 20).forEach(s => r += `  ${MA}•${RST} ${s}\n`);
                    if (breachSources.size > 20) r += `  ${GY}...and ${breachSources.size - 20} more${RST}\n`;
                }

                // SUMMARY
                r += head('SUMMARY');
                r += row('Breaches',  `${breachSources.size}`);
                r += row('Records',   `${records.length}`);
                r += row('Emails',    `${emails.length}`);
                r += row('Names',     `${names.length}`);
                r += row('Addresses', `${uniqueAddrs.length}`);
                r += row('Passwords', `${passwords.length}`);

                // Extra sources: Breachhub + Luperly + Swatted.wtf
                const extra = await extraOsintBlock(phoneE164, 'phone');
                if (extra) r += extra;

                r += `${CY}${SUB}${RST}\n\`\`\``;

                const send = async (text: string) => {
                    if (text.length <= 1990) return message.edit(text).catch(() => {});
                    const lines = text.split('\n');
                    let buf = '```ansi\n';
                    let first = true;
                    for (const line of lines) {
                        if (line === '```ansi' || line === '```') continue;
                        if ((buf + line + '\n```').length > 1900) {
                            buf += '```';
                            if (first) { await message.edit(buf).catch(() => {}); first = false; }
                            else       { await message.channel.send(buf).catch(() => {}); }
                            buf = '```ansi\n';
                        }
                        buf += line + '\n';
                    }
                    buf += '```';
                    if (first) await message.edit(buf).catch(() => {});
                    else       await message.channel.send(buf).catch(() => {});
                };
                await send(r);
                return;
            }
        }

        // ── FULL REPORT (multi-input mega-dossier) ───────────────────────────
        if (command === 'full' && args[0]?.toLowerCase() === 'report') {
            const raw = args.slice(1).join(' ').trim();
            if (!raw) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}full report <input1>, <input2>, ...\u001b[0m\n  Inputs: any mix of email, phone, IP, Discord ID, coordinates, address\n\`\`\``).catch(() => {});
            }

            const C = (n: number) => `\u001b[1;${n}m`;
            const CY = C(36), YE = C(33), GR = C(32), RE = C(31), GY = C(30), WH = C(37), MA = C(35), BL = C(34), RST = '\u001b[0m';
            const SUB = '─'.repeat(50);
            const padL = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row  = (k: string, v: string) => `  ${YE}${padL(k + ':', 14)}${RST} ${v}\n`;
            const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

            // ── Tokenize and classify ────────────────────────────────────────
            type Kind = 'email' | 'ip' | 'discord' | 'phone' | 'coords' | 'address';
            const classifyOne = (v: string): Kind => {
                const t = v.trim();
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(t)) return 'ip';
                if (/^[0-9a-fA-F:]+$/.test(t) && t.includes(':') && t.length >= 3) return 'ip'; // IPv6
                if (parseCoordinates(t)) return 'coords';
                const digits = t.replace(/[\s\-()+]/g, '');
                if (/^\d+$/.test(digits)) {
                    if (digits.length >= 17 && digits.length <= 20 && !t.startsWith('+')) return 'discord';
                    if (digits.length >= 7 && digits.length <= 15) return 'phone';
                    if (digits.length > 15) return 'discord';
                }
                return 'address';
            };

            // Split on commas, then merge logic
            const rawTokens = raw.split(',').map(s => s.trim()).filter(Boolean);

            // Try to merge adjacent tokens that together form coords (e.g. "40.7128, -74.0060")
            const tokens: string[] = [];
            for (let i = 0; i < rawTokens.length; i++) {
                if (i + 1 < rawTokens.length) {
                    const merged = `${rawTokens[i]}, ${rawTokens[i + 1]}`;
                    if (parseCoordinates(merged)) {
                        tokens.push(merged);
                        i++;
                        continue;
                    }
                }
                tokens.push(rawTokens[i]);
            }

            // Merge adjacent address fragments (consecutive 'address'-classified tokens)
            const items: { kind: Kind; value: string }[] = [];
            let pendingAddr: string[] = [];
            const flushAddr = () => {
                if (pendingAddr.length) {
                    items.push({ kind: 'address', value: pendingAddr.join(', ') });
                    pendingAddr = [];
                }
            };
            for (const tk of tokens) {
                const k = classifyOne(tk);
                if (k === 'address') pendingAddr.push(tk);
                else { flushAddr(); items.push({ kind: k, value: tk }); }
            }
            flushAddr();

            if (items.length === 0) {
                return message.edit(`\`\`\`ansi\n${RE}[!] No valid inputs detected.${RST}\n\`\`\``).catch(() => {});
            }

            // Status banner
            const summary = items.map(i => `${i.kind}:${i.value.length > 30 ? i.value.slice(0, 27) + '...' : i.value}`).join(' | ');
            await message.edit(`\`\`\`ansi\n${BL}[*] FULL REPORT · ${items.length} input(s)${RST}\n${GY}> ${summary}${RST}\n${GY}> Querying every available OSINT source in parallel...${RST}\n\`\`\``).catch(() => {});

            // ── Per-kind builders ────────────────────────────────────────────
            const buildEmail = async (email: string): Promise<string> => {
                const [lc, sn, snB, seon] = await Promise.all([
                    leakcheckQuery(email, 'email'),
                    snusbaseSearch(email, 'email'),
                    snusbaseBetaSearch(email, 'email'),
                    seonEmailCheck(email),
                ]);
                const sources = new Set<string>();
                const passwords = new Set<string>();
                const usernames = new Set<string>();
                const names = new Set<string>();
                const phones = new Set<string>();
                const ips = new Set<string>();
                const addrs = new Set<string>();
                const dobs = new Set<string>();
                const records: { source: string; username?: string; email?: string; password?: string; hash?: string; ip?: string }[] = [];
                let recs = 0;
                const eat = (data: any) => {
                    if (!data?.results) return;
                    for (const [db, rows] of Object.entries<any>(data.results)) {
                        sources.add(db);
                        for (const e of (rows || [])) {
                            recs++;
                            if (e.password) passwords.add(e.password);
                            if (e.username) usernames.add(e.username);
                            if (e.name) names.add(e.name);
                            if (e.phone) phones.add(e.phone);
                            if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                            const a = [e.address, e.city, e.state, e.zip || e.zipcode, e.country].filter(Boolean).join(', ');
                            if (a.length > 4) addrs.add(a);
                            if (e.dob || e.birthdate) dobs.add(e.dob || e.birthdate);
                            records.push({ source: db, username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.lastip || e.ip });
                        }
                    }
                };
                eat(sn); eat(snB);
                if (lc?.success && Array.isArray(lc.result)) {
                    for (const e of lc.result) {
                        recs++;
                        const sn2 = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (sn2) sources.add(sn2);
                        if (e.password) passwords.add(e.password);
                        if (e.username) usernames.add(e.username);
                        if (e.first_name && e.last_name) names.add(`${e.first_name} ${e.last_name}`);
                        else if (e.name) names.add(e.name);
                        if (e.phone) phones.add(e.phone);
                        const a = [e.address, e.city, e.state, e.zip, e.country].filter(Boolean).join(', ');
                        if (a.length > 4) addrs.add(a);
                        if (e.dob) dobs.add(e.dob);
                        records.push({ source: sn2 || 'LeakCheck', username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.ip });
                    }
                }

                let r = head(`EMAIL · ${email}`);
                r += row('Breaches',  `${sources.size}`);
                r += row('Records',   `${recs}`);
                if (names.size)     r += row('Name(s)',     Array.from(names).join(', '));
                if (usernames.size) r += row('Username(s)', Array.from(usernames).join(', '));
                if (phones.size)    r += row('Phone(s)',    Array.from(phones).join(', '));
                if (dobs.size)      r += row('DOB',         Array.from(dobs).join(', '));
                if (ips.size)       r += row('IP(s)',       Array.from(ips).join(', '));
                if (addrs.size) {
                    r += `  ${YE}Addresses:${RST}\n`;
                    Array.from(addrs).forEach(a => r += `    ${MA}•${RST} ${a}\n`);
                }
                if (passwords.size) {
                    r += `  ${YE}Passwords (unique):${RST}\n`;
                    Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
                }
                if (sources.size) {
                    r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
                }
                // Per-record credential breakdown — what works for what
                if (records.length) {
                    r += `  ${YE}Credentials by source:${RST}\n`;
                    for (const rec of records) {
                        const id = rec.email || rec.username || '—';
                        const cred = rec.password ? rec.password : (rec.hash ? `<hash:${rec.hash.slice(0, 24)}${rec.hash.length > 24 ? '…' : ''}>` : `${GY}(no password)${RST}`);
                        const ipBit = rec.ip ? ` ${GY}[ip:${rec.ip}]${RST}` : '';
                        r += `    ${MA}•${RST} ${CY}[${rec.source}]${RST} ${id} :: ${RE}${cred}${RST}${ipBit}\n`;
                    }
                }
                if (seon?.data) {
                    const d = seon.data;
                    const bits: string[] = [];
                    if (d.deliverable !== undefined) bits.push(`deliverable=${d.deliverable ? 'Y' : 'N'}`);
                    if (d.fraud_score !== undefined) bits.push(`fraud=${d.fraud_score}`);
                    if (d.disposable !== undefined) bits.push(`disposable=${d.disposable ? 'Y' : 'N'}`);
                    if (bits.length) r += row('SEON', bits.join(' · '));
                    // Connected services / sites the email is registered on
                    if (d.account_details && typeof d.account_details === 'object') {
                        const services = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered)
                            .map(([k, v]) => v?.name || k);
                        if (services.length) {
                            r += `  ${YE}Services:${RST}\n`;
                            services.slice(0, 18).forEach(s => r += `    ${MA}•${RST} ${s}\n`);
                            if (services.length > 18) r += `    ${GY}+${services.length - 18} more${RST}\n`;
                        }
                        // Per-service account creation dates (when SEON reports them)
                        const created = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered && (v?.date || v?.created || v?.creation_date))
                            .map(([k, v]) => `${v?.name || k}=${v.date || v.created || v.creation_date}`);
                        if (created.length) r += row('Created', created.slice(0, 6).join(' · '));
                    }
                    if (d.domain_details) {
                        const dd = d.domain_details;
                        const dbits: string[] = [];
                        if (dd.created) dbits.push(`created=${dd.created}`);
                        if (dd.registrar_name) dbits.push(dd.registrar_name);
                        if (dd.tld) dbits.push(`tld=${dd.tld}`);
                        if (dbits.length) r += row('Domain', dbits.join(' · '));
                    }
                    if (d.breach_details?.breaches?.length) {
                        const list = d.breach_details.breaches.map((b: any) => b.name).filter(Boolean);
                        if (list.length) r += row('SEON breaches', list.slice(0, 8).join(', '));
                    }
                }
                r += await extraOsintBlock(email, 'email');
                return r;
            };

            const buildPhone = async (phoneRaw: string): Promise<string> => {
                const phoneBare = phoneRaw.replace(/[\s\-()+]/g, '');
                const phoneE164 = phoneRaw.startsWith('+') ? phoneRaw.replace(/[\s\-()]/g, '') : `+${phoneBare}`;
                const [veri, seon, snA, snB, sbA, sbB, lc] = await Promise.all([
                    phoneVerify(phoneE164),
                    seonPhoneCheck(phoneE164),
                    snusbaseSearch(phoneBare, 'phone'),
                    snusbaseSearch(phoneE164, 'phone'),
                    snusbaseBetaSearch(phoneBare, 'phone'),
                    snusbaseBetaSearch(phoneE164, 'phone'),
                    leakcheckQuery(phoneBare, 'phone'),
                ]);
                const sources = new Set<string>();
                const emails = new Set<string>();
                const passwords = new Set<string>();
                const usernames = new Set<string>();
                const names = new Set<string>();
                const ips = new Set<string>();
                const addrs = new Set<string>();
                const dobs = new Set<string>();
                const records: { source: string; username?: string; email?: string; password?: string; hash?: string; ip?: string }[] = [];
                let recs = 0;
                const eat = (data: any) => {
                    if (!data?.results) return;
                    for (const [db, rows] of Object.entries<any>(data.results)) {
                        sources.add(db);
                        for (const e of (rows || [])) {
                            recs++;
                            if (e.email) emails.add(e.email);
                            if (e.password) passwords.add(e.password);
                            if (e.username) usernames.add(e.username);
                            if (e.name) names.add(e.name);
                            if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                            const a = [e.address, e.city, e.state, e.zip || e.zipcode, e.country].filter(Boolean).join(', ');
                            if (a.length > 4) addrs.add(a);
                            if (e.dob || e.birthdate) dobs.add(e.dob || e.birthdate);
                            records.push({ source: db, username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.lastip || e.ip });
                        }
                    }
                };
                eat(snA); eat(snB); eat(sbA); eat(sbB);
                if (lc?.success && Array.isArray(lc.result)) {
                    for (const e of lc.result) {
                        recs++;
                        const sn = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (sn) sources.add(sn);
                        if (e.email) emails.add(e.email);
                        if (e.password) passwords.add(e.password);
                        if (e.username) usernames.add(e.username);
                        if (e.first_name && e.last_name) names.add(`${e.first_name} ${e.last_name}`);
                        else if (e.name) names.add(e.name);
                        const a = [e.address, e.city, e.state, e.zip, e.country].filter(Boolean).join(', ');
                        if (a.length > 4) addrs.add(a);
                        if (e.dob) dobs.add(e.dob);
                        records.push({ source: sn || 'LeakCheck', username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.ip });
                    }
                }
                const lastAddr = Array.from(addrs).sort((a, b) => b.length - a.length)[0] || '';

                let r = head(`PHONE · ${phoneE164}`);
                if (veri?.phone_valid !== undefined) {
                    const bits: string[] = [];
                    bits.push(`valid=${veri.phone_valid ? 'Y' : 'N'}`);
                    if (veri.country) bits.push(veri.country);
                    if (veri.phone_type) bits.push(veri.phone_type);
                    if (veri.carrier) bits.push(veri.carrier);
                    r += row('Veriphone', bits.join(' · '));
                }
                if (seon?.data) {
                    const d = seon.data;
                    const bits: string[] = [];
                    if (d.valid !== undefined) bits.push(`valid=${d.valid ? 'Y' : 'N'}`);
                    if (d.type) bits.push(d.type);
                    if (d.carrier) bits.push(d.carrier);
                    if (d.country) bits.push(d.country);
                    if (d.score !== undefined) bits.push(`score=${d.score}`);
                    if (d.disposable !== undefined) bits.push(`disposable=${d.disposable ? 'Y' : 'N'}`);
                    if (bits.length) r += row('SEON', bits.join(' · '));
                    // Connected services for phone (SEON sometimes returns account_details for phones too)
                    if (d.account_details && typeof d.account_details === 'object') {
                        const services = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered)
                            .map(([k, v]) => v?.name || k);
                        if (services.length) {
                            r += `  ${YE}Services (${services.length}):${RST}\n`;
                            services.forEach(s => r += `    ${MA}•${RST} ${s}\n`);
                        }
                        const created = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered && (v?.date || v?.created || v?.creation_date))
                            .map(([k, v]) => `${v?.name || k}=${v.date || v.created || v.creation_date}`);
                        if (created.length) r += row('Created', created.join(' · '));
                    }
                }
                r += row('Last addr',  lastAddr || `${GY}none${RST}`);
                r += row('Breaches',   `${sources.size}`);
                r += row('Records',    `${recs}`);
                if (names.size)     r += row('Name(s)',    Array.from(names).join(', '));
                if (emails.size)    r += row('Email(s)',   Array.from(emails).join(', '));
                if (usernames.size) r += row('Username(s)', Array.from(usernames).join(', '));
                if (dobs.size)      r += row('DOB',        Array.from(dobs).join(', '));
                if (ips.size)       r += row('IP(s)',      Array.from(ips).join(', '));
                if (addrs.size > 1) {
                    r += `  ${YE}Other addrs:${RST}\n`;
                    Array.from(addrs).filter(a => a !== lastAddr).forEach(a => r += `    ${MA}•${RST} ${a}\n`);
                }
                if (passwords.size) {
                    r += `  ${YE}Passwords (unique):${RST}\n`;
                    Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
                }
                if (sources.size) {
                    r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
                }
                if (records.length) {
                    r += `  ${YE}Credentials by source:${RST}\n`;
                    for (const rec of records) {
                        const id = rec.email || rec.username || '—';
                        const cred = rec.password ? rec.password : (rec.hash ? `<hash:${rec.hash.slice(0, 24)}${rec.hash.length > 24 ? '…' : ''}>` : `${GY}(no password)${RST}`);
                        const ipBit = rec.ip ? ` ${GY}[ip:${rec.ip}]${RST}` : '';
                        r += `    ${MA}•${RST} ${CY}[${rec.source}]${RST} ${id} :: ${RE}${cred}${RST}${ipBit}\n`;
                    }
                }
                r += await extraOsintBlock(phoneE164, 'phone');
                return r;
            };

            const buildIp = async (ip: string): Promise<string> => {
                const [api, info] = await Promise.all([ipApiLookup(ip), ipInfoLookup(ip)]);
                const lat = api?.lat ?? (info?.loc ? parseFloat(info.loc.split(',')[0]) : null);
                const lon = api?.lon ?? (info?.loc ? parseFloat(info.loc.split(',')[1]) : null);
                let geo: any = null;
                if (lat != null && lon != null) {
                    geo = await nominatimReverseAddress(lat, lon).catch(() => null);
                }
                let r = head(`IP · ${ip}`);
                if (api?.status === 'success') {
                    r += row('Country',  `${api.country}${api.countryCode ? ` (${api.countryCode})` : ''}`);
                    if (api.regionName) r += row('Region',   api.regionName);
                    if (api.city)       r += row('City',     api.city);
                    if (api.zip)        r += row('ZIP',      api.zip);
                    if (api.lat != null && api.lon != null) r += row('Coords', `${api.lat}, ${api.lon}`);
                    if (api.timezone)   r += row('Timezone', api.timezone);
                    if (api.isp)        r += row('ISP',      api.isp);
                    if (api.org)        r += row('Org',      api.org);
                    if (api.as)         r += row('ASN',      api.as);
                    if (api.reverse)    r += row('rDNS',     api.reverse);
                    const flags: string[] = [];
                    if (api.mobile)  flags.push(`${YE}mobile${RST}`);
                    if (api.proxy)   flags.push(`${RE}proxy/VPN${RST}`);
                    if (api.hosting) flags.push(`${RE}hosting${RST}`);
                    if (flags.length) r += row('Flags', flags.join(' · '));
                } else {
                    r += `  ${RE}ip-api: ${api?.message || 'failed'}${RST}\n`;
                }
                if (info && !info.bogon) {
                    if (info.hostname) r += row('Hostname', info.hostname);
                    if (info.org && info.org !== api?.org) r += row('IPInfo org', info.org);
                }
                if (geo?.address) r += row('Address',  geo.address);
                if (lat != null && lon != null) r += row('Map',  `https://www.google.com/maps?q=${lat},${lon}`);
                r += await extraOsintBlock(ip, 'ip');
                return r;
            };

            const buildCoords = async (s: string): Promise<string> => {
                const c = parseCoordinates(s)!;
                const geo = await nominatimReverseAddress(c.lat, c.lon).catch(() => null);
                let r = head(`COORDS · ${c.lat}, ${c.lon}`);
                if (geo?.address) r += row('Address',  geo.address);
                if (geo?.road)    r += row('Road',     geo.road);
                if (geo?.city)    r += row('City',     geo.city);
                if (geo?.state)   r += row('State',    geo.state);
                if (geo?.country) r += row('Country',  geo.country);
                r += row('Map',      `https://www.google.com/maps?q=${c.lat},${c.lon}`);
                r += row('OSM',      `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=18/${c.lat}/${c.lon}`);
                return r;
            };

            const buildAddress = async (addr: string): Promise<string> => {
                const hit = await nominatimSearch(addr).catch(() => null);
                let r = head(`ADDRESS · ${addr}`);
                if (!hit) { r += `  ${GY}— address not found —${RST}\n`; return r; }
                const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
                r += row('Resolved', hit.display_name || `${lat}, ${lon}`);
                if (hit.type)  r += row('Type',     `${hit.class || ''}/${hit.type}`);
                r += row('Coords',   `${lat}, ${lon}`);
                r += row('Map',      `https://www.google.com/maps?q=${lat},${lon}`);
                // Nearby Overpass features (best-effort, keep small)
                try {
                    const nearby = await overpassNearby(lat, lon, 60);
                    if (nearby && nearby.length) {
                        const named = nearby.filter((e: any) => e.tags?.name).slice(0, 5);
                        if (named.length) {
                            r += `  ${YE}Nearby:${RST}\n`;
                            named.forEach((e: any) => r += `    ${MA}•${RST} ${e.tags.name}${e.tags.amenity ? ` (${e.tags.amenity})` : ''}\n`);
                        }
                    }
                } catch (_) {}
                return r;
            };

            const buildDiscord = async (id: string): Promise<string> => {
                // Snowflake decode
                const DISCORD_EPOCH = 1420070400000n;
                let createdAt = 'Unknown', ageDays = 0;
                try {
                    const big = BigInt(id);
                    const ts = Number((big >> 22n) + DISCORD_EPOCH);
                    createdAt = new Date(ts).toUTCString();
                    ageDays = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
                } catch (_) {}
                let user: any = null;
                let userProfile: any = null;
                try { user = await client.users.fetch(id, { force: true }); } catch (_) {}
                // Try to grab the bio / about_me via the profile endpoint (selfbot)
                try { userProfile = await (user as any)?.fetchProfile?.(); } catch (_) {}
                // snowid.lol
                let snowid: any = null;
                try {
                    const resp = await fetch('https://snowid.lol/api/lookup', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ discordId: id, fast: true }),
                    });
                    try { snowid = JSON.parse(await resp.text()); } catch (_) {}
                } catch (_) {}
                // Breach DB queries
                const terms: string[] = [id];
                if (user?.username) {
                    terms.push(user.username);
                    if (user.discriminator && user.discriminator !== '0') terms.push(`${user.username}#${user.discriminator}`);
                }
                const queries: Promise<any>[] = [];
                for (const t of terms) {
                    queries.push(snusbaseSearch(t, 'username'));
                    queries.push(snusbaseBetaSearch(t, 'username'));
                    queries.push(leakcheckQuery(t, 'username'));
                }
                const all = await Promise.all(queries);
                const sources = new Set<string>();
                const emails = new Set<string>();
                const passwords = new Set<string>();
                const ips = new Set<string>();
                const aliases = new Set<string>();
                const records: { source: string; username?: string; email?: string; password?: string; hash?: string; ip?: string }[] = [];
                let recs = 0;
                for (let i = 0; i < all.length; i++) {
                    const data = all[i];
                    const isLc = (i % 3) === 2;
                    if (isLc) {
                        if (data?.success && Array.isArray(data.result)) {
                            for (const e of data.result) {
                                recs++;
                                const sn = typeof e.source === 'object' ? e.source?.name : e.source;
                                if (sn) sources.add(sn);
                                if (e.email) emails.add(e.email);
                                if (e.password) passwords.add(e.password);
                                if (e.username) aliases.add(e.username);
                                records.push({ source: sn || 'LeakCheck', username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.ip });
                            }
                        }
                    } else if (data?.results) {
                        for (const [db, rows] of Object.entries<any>(data.results)) {
                            sources.add(db);
                            for (const e of (rows || [])) {
                                recs++;
                                if (e.email) emails.add(e.email);
                                if (e.password) passwords.add(e.password);
                                if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                                if (e.username) aliases.add(e.username);
                                records.push({ source: db, username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.lastip || e.ip });
                            }
                        }
                    }
                }

                let r = head(`DISCORD · ${id}`);
                if (user) {
                    const flags = user.flags?.toArray().join(', ') || 'None';
                    r += row('Tag',       user.tag);
                    r += row('Username',  user.username);
                    r += row('Display',   user.displayName || user.globalName || user.username);
                    r += row('Bot',       user.bot ? 'Yes' : 'No');
                    r += row('Badges',    flags);
                    const bio = userProfile?.bio || userProfile?.user?.bio || (userProfile as any)?.user_profile?.bio || '';
                    if (bio) {
                        r += `  ${YE}Bio:${RST}\n`;
                        String(bio).split('\n').forEach(line => r += `    ${line}\n`);
                    }
                    const pronouns = userProfile?.pronouns || (userProfile as any)?.user_profile?.pronouns;
                    if (pronouns) r += row('Pronouns', String(pronouns));
                    if (userProfile?.connectedAccounts?.length || userProfile?.connected_accounts?.length) {
                        const conn = (userProfile.connectedAccounts || userProfile.connected_accounts || [])
                            .map((c: any) => `${c.type}:${c.name || c.id}${c.verified ? ' ✓' : ''}`);
                        if (conn.length) r += row('Connections', conn.join(', '));
                    }
                    if (user.avatar) r += row('Avatar', `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=512`);
                    if (user.banner) r += row('Banner', `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${user.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`);
                    if (user.accentColor) r += row('Accent', `#${user.accentColor.toString(16).padStart(6, '0')}`);
                } else {
                    r += `  ${RE}— user could not be fetched —${RST}\n`;
                }
                r += row('Created',  createdAt);
                r += row('Age',      `${ageDays} days`);
                if (snowid && !snowid.error) {
                    const entries = Object.entries(snowid).filter(([, v]) => v != null && v !== '' && typeof v !== 'object');
                    if (entries.length) {
                        r += `  ${YE}snowid.lol:${RST}\n`;
                        entries.forEach(([k, v]) => r += `    ${MA}•${RST} ${k}: ${v}\n`);
                    }
                }
                r += row('Breaches', `${sources.size}`);
                r += row('Records',  `${recs}`);
                if (emails.size)    r += row('Emails',   Array.from(emails).join(', '));
                if (aliases.size)   r += row('Aliases',  Array.from(aliases).join(', '));
                if (ips.size)       r += row('IPs',      Array.from(ips).join(', '));
                if (passwords.size) {
                    r += `  ${YE}Passwords (unique):${RST}\n`;
                    Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
                }
                if (sources.size) {
                    r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
                }
                if (records.length) {
                    r += `  ${YE}Credentials by source:${RST}\n`;
                    for (const rec of records) {
                        const id2 = rec.email || rec.username || '—';
                        const cred = rec.password ? rec.password : (rec.hash ? `<hash:${rec.hash.slice(0, 24)}${rec.hash.length > 24 ? '…' : ''}>` : `${GY}(no password)${RST}`);
                        const ipBit = rec.ip ? ` ${GY}[ip:${rec.ip}]${RST}` : '';
                        r += `    ${MA}•${RST} ${CY}[${rec.source}]${RST} ${id2} :: ${RE}${cred}${RST}${ipBit}\n`;
                    }
                }
                r += await extraOsintBlock(id, 'discord');
                if (user?.username) r += await extraOsintBlock(user.username, 'username');
                return r;
            };

            // ── Run all sections in parallel ─────────────────────────────────
            const sectionPromises = items.map(item => {
                switch (item.kind) {
                    case 'email':   return buildEmail(item.value);
                    case 'phone':   return buildPhone(item.value);
                    case 'ip':      return buildIp(item.value);
                    case 'coords':  return buildCoords(item.value);
                    case 'address': return buildAddress(item.value);
                    case 'discord': return buildDiscord(item.value);
                }
            });
            const sections = await Promise.all(sectionPromises);

            // ── Assemble final report ────────────────────────────────────────
            let out = `\`\`\`ansi\n`;
            out += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
            out += `${CY}║                FULL OSINT REPORT                 ║${RST}\n`;
            out += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
            out += `${WH}Inputs:${RST} ${items.length}\n`;
            items.forEach((i, idx) => {
                out += `  ${YE}${idx + 1}.${RST} ${GY}[${i.kind}]${RST} ${i.value}\n`;
            });
            out += sections.join('');
            out += `${CY}${SUB}${RST}\n\`\`\``;

            // Send with auto-split (each section in its own message if huge)
            const sendMulti = async (text: string) => {
                if (text.length <= 1990) {
                    return message.edit(text).catch(() => {});
                }
                const lines = text.split('\n');
                let buf = '```ansi\n';
                let first = true;
                for (const line of lines) {
                    if (line === '```ansi' || line === '```') continue;
                    if ((buf + line + '\n```').length > 1900) {
                        buf += '```';
                        if (first) { await message.edit(buf).catch(() => {}); first = false; }
                        else       { await message.channel.send(buf).catch(() => {}); }
                        buf = '```ansi\n';
                    }
                    buf += line + '\n';
                }
                buf += '```';
                if (first) await message.edit(buf).catch(() => {});
                else       await message.channel.send(buf).catch(() => {});
            };
            await sendMulti(out);

            // ── Also send a clean .txt download of the same report ──────────
            try {
                const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '').replace(/^```ansi\n?|```$/gm, '');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                const header =
                    `FULL OSINT REPORT\n` +
                    `Generated: ${new Date().toUTCString()}\n` +
                    `Inputs (${items.length}):\n` +
                    items.map((i, idx) => `  ${idx + 1}. [${i.kind}] ${i.value}`).join('\n') +
                    `\n${'='.repeat(60)}\n\n`;
                const body = stripAnsi(sections.join(''));
                const fileBuffer = Buffer.from(header + body, 'utf-8');
                await message.channel.send({
                    content: `\`\`\`ansi\n${BL}[+] Full report attached as a downloadable file${RST}\n\`\`\``,
                    files: [{ attachment: fileBuffer, name: `full-report-${ts}.txt` }],
                }).catch(() => {});
            } catch (_) { /* file send is best-effort */ }
            return;
        }

        // ── MEMBERS MSGS ──────────────────────────────────────────────────────
        if (command === 'members' && args[0]?.toLowerCase() === 'msgs') {
            const count = parseInt(args[1]);
            if (isNaN(count) || count < 1) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}members msgs <count>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] FETCHING LAST ${count} MEMBER MESSAGES...\u001b[0m\n\`\`\``);

            try {
                const fetched = await message.channel.messages.fetch({ limit: Math.min(count + 5, 100) });
                const msgs = Array.from(fetched.values())
                    .filter((m: any) => !m.author.bot && m.id !== message.id && m.content?.trim())
                    .slice(0, count);

                if (msgs.length === 0) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No recent member messages found.\u001b[0m\n\`\`\``).catch(() => {});
                }

                let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] LAST ${msgs.length} MESSAGES\u001b[0m\n`;
                result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

                msgs.reverse().forEach((m: any) => {
                    const ts = new Date(m.createdTimestamp).toLocaleTimeString();
                    const tag = m.author.tag || m.author.username;
                    const content = m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content;
                    result += `\u001b[1;33m[${ts}]\u001b[0m \u001b[1;32m${tag}\u001b[0m: ${content}\n`;
                });

                result += `\`\`\``;
                await message.edit(result).catch(() => {});
            } catch (e) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch messages.\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── IP CHECK (enhanced with map) ──────────────────────────────────────
        // ── CONVERT CORDS (reverse geocode coordinates → address) ────────────
        if (command === 'convert' && args[0]?.toLowerCase() === 'cords') {
            const raw = args.slice(1).join(' ').trim();
            if (!raw) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}convert cords <coordinates>\u001b[0m\n\u001b[1;30mAccepts decimal (e.g. 42.2853, -87.9532) or DMS (e.g. 42°17'07.1"N 87°57'11.5"W).\u001b[0m\n\`\`\``).catch(() => {});
            }

            const parsed = parseCoordinates(raw);
            if (!parsed) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not parse coordinates: ${raw}\u001b[0m\n\u001b[1;30mTry: 42.2853, -87.9532  or  42°17'07.1"N 87°57'11.5"W\u001b[0m\n\`\`\``).catch(() => {});
            }

            const { lat, lon } = parsed;
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Reverse geocoding ${lat}, ${lon}...\u001b[0m\n\`\`\``).catch(() => {});

            const addr = await nominatimReverseAddress(lat, lon);
            if (!addr) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Reverse geocoding failed or no result.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const street = [addr.houseNumber, addr.road].filter(Boolean).join(' ') || (addr.road || '—');
            const mapUrl = staticMapUrl(lat, lon, 14);
            const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            const osmUrl = osmEmbedUrl(lat, lon, 0.02);

            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) =>
                `  \u001b[1;33m${pad(label + ':', 12)}\u001b[0m ${value}\n`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║         NETRUNNER · COORD → ADDRESS          ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mInput:\u001b[0m  ${raw}\n`;
            result += `\u001b[1;37mCoords:\u001b[0m ${lat}, ${lon}\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ ADDRESS ]\u001b[0m\n`;
            result += row('Address',  addr.formatted || '—');
            result += row('Street',   street);
            result += row('City',     addr.city || '—');
            result += row('Region',   addr.state || '—');
            result += row('Postcode', addr.postcode || '—');
            result += row('Country',  addr.country ? `${addr.country}${addr.countryCode ? ` (${addr.countryCode})` : ''}` : '—');
            if (!addr.isExactAddress) {
                result += `  \u001b[1;30m(no exact street number at these coords — showing nearest road)\u001b[0m\n`;
            }
            if (addr.placeName && addr.placeName !== addr.road) {
                result += row('Nearby',  `${addr.placeName}${addr.placeType ? ` (${addr.placeType})` : ''}`);
            }
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ MAP ]\u001b[0m\n`;
            result += `  \u001b[1;32mGoogle:\u001b[0m ${googleMapsUrl}\n`;
            result += `  \u001b[1;32mOSM:\u001b[0m    ${osmUrl}\n`;

            // Extra OSINT sources (Breachhub + Luperly + Swatted.wtf)
            const extra = await extraOsintBlock(ip, 'ip');
            if (extra) result += extra;

            result += `\`\`\``;

            await message.edit(result).catch(() => {});
            await message.channel.send(mapUrl).catch(() => {});
            return;
        }

        // ── GPT — keyless AI chat via Pollinations.ai ────────────────────────
        if (command === 'gpt') {
            const question = args.join(' ').trim();
            if (!question) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gpt <question>\u001b[0m\n\u001b[1;30mExample: ${prefix}gpt who won the 2022 world cup?\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Asking AI...\u001b[0m\n\u001b[1;30m> ${question.slice(0, 100)}${question.length > 100 ? '...' : ''}\u001b[0m\n\`\`\``).catch(() => {});

            try {
                const resp = await fetch('https://text.pollinations.ai/openai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'openai',
                        messages: [
                            { role: 'system', content: 'You are a helpful, concise assistant. Keep answers under 1500 characters when possible.' },
                            { role: 'user', content: question },
                        ],
                    }),
                });

                if (!resp.ok) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] AI request failed (${resp.status}).\u001b[0m\n\`\`\``).catch(() => {});
                }

                let answer = '';
                const ct = resp.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const data: any = await resp.json();
                    answer = data?.choices?.[0]?.message?.content || data?.response || JSON.stringify(data).slice(0, 1500);
                } else {
                    answer = await resp.text();
                }

                answer = (answer || '').trim();
                if (!answer) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] AI returned an empty response.\u001b[0m\n\`\`\``).catch(() => {});
                }

                // Discord message hard limit is 2000 chars. Reserve room for header + code fences.
                const MAX = 1850;
                if (answer.length <= MAX) {
                    await message.edit(`**🤖 GPT** — *${question.slice(0, 80)}${question.length > 80 ? '...' : ''}*\n\`\`\`\n${answer}\n\`\`\``).catch(() => {});
                } else {
                    // Split into chunks across multiple messages
                    const chunks: string[] = [];
                    let remaining = answer;
                    while (remaining.length > 0) {
                        chunks.push(remaining.slice(0, MAX));
                        remaining = remaining.slice(MAX);
                    }
                    await message.edit(`**🤖 GPT** — *${question.slice(0, 80)}${question.length > 80 ? '...' : ''}*\n\`\`\`\n${chunks[0]}\n\`\`\``).catch(() => {});
                    for (let i = 1; i < chunks.length; i++) {
                        await message.channel.send(`\`\`\`\n${chunks[i]}\n\`\`\``).catch(() => {});
                    }
                }
            } catch (e: any) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] AI request error: ${e?.message || 'unknown'}\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── WHO LIVES <address> — public-only occupancy info ─────────────────
        if (command === 'who' && args[0]?.toLowerCase() === 'lives') {
            // Allow `.who lives at 123 Main St` or `.who lives 123 Main St`
            const startIdx = args[1]?.toLowerCase() === 'at' ? 2 : 1;
            const address = args.slice(startIdx).join(' ').trim();
            if (!address) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}who lives <address>\u001b[0m\n\u001b[1;30mExample: ${prefix}who lives 1600 Pennsylvania Ave NW, Washington DC\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] WHO LIVES: ${address}\u001b[0m\n\u001b[1;30m> Searching public records (OSM + Wikidata)...\u001b[0m\n\`\`\``).catch(() => {});

            const place = await nominatimSearch(address);
            if (!place) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Address not found in OpenStreetMap.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const lat = parseFloat(place.lat);
            const lon = parseFloat(place.lon);
            const a = place.address || {};
            const extratags = place.extratags || {};
            const buildingType = extratags.building || a.building || place.type || place.category || '';
            const placeName = place.namedetails?.name || place.name || '';
            const formatted = place.display_name || address;

            // Run lookups in parallel: nearby businesses + notable Wikidata residents
            const placeQid = (extratags['wikidata'] || place.extratags?.wikidata || '');
            const [pois, residents] = await Promise.all([
                overpassNearby(lat, lon, 30),
                wikidataResidentsAt(placeQid),
            ]);

            // Filter & dedupe POIs (keep ones with a name)
            const seen = new Set<string>();
            const businesses = pois
                .map((el: any) => {
                    const t = el.tags || {};
                    const nm = t.name;
                    if (!nm || seen.has(nm)) return null;
                    seen.add(nm);
                    const kind = t.amenity || t.shop || t.office || t.tourism || t.craft || t.leisure || t.building || '';
                    return { name: nm, kind };
                })
                .filter((x: any): x is { name: string; kind: string } => !!x)
                .slice(0, 15);

            const isResidential = /residential|apartments|house|detached|terrace|dormitory/i.test(buildingType);

            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) =>
                `  \u001b[1;33m${pad(label + ':', 14)}\u001b[0m ${value}\n`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║         NETRUNNER · WHO LIVES HERE           ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mInput:\u001b[0m  ${address}\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;

            result += `\u001b[1;36m[ LOCATION ]\u001b[0m\n`;
            result += row('Address',  formatted);
            result += row('Coords',   `${lat}, ${lon}`);
            result += row('City',     a.city || a.town || a.village || a.hamlet || '—');
            result += row('Region',   a.state || a.region || '—');
            result += row('Country',  a.country || '—');

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ BUILDING ]\u001b[0m\n`;
            result += row('Type',     buildingType || 'unknown');
            result += row('Name',     placeName || '—');
            result += row('Use',      isResidential ? 'Residential' : (buildingType ? 'Non-residential' : 'Unknown'));

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ BUSINESSES / TENANTS AT THIS LOCATION ]\u001b[0m\n`;
            if (businesses.length === 0) {
                result += `  \u001b[1;30m— None registered in OpenStreetMap at this address —\u001b[0m\n`;
            } else {
                for (const b of businesses) {
                    result += `  • \u001b[1;37m${b.name}\u001b[0m${b.kind ? ` \u001b[1;30m(${b.kind})\u001b[0m` : ''}\n`;
                }
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ NOTABLE PEOPLE LINKED TO THIS PLACE ]\u001b[0m\n`;
            if (residents.length === 0) {
                result += `  \u001b[1;30m— No public-figure entries link this place to a person —\u001b[0m\n`;
            } else {
                for (const r of residents.slice(0, 12)) {
                    result += `  • \u001b[1;37m${r.name}\u001b[0m \u001b[1;30m(${r.relation})\u001b[0m\n`;
                    if (r.description) result += `      ${r.description.slice(0, 70)}\n`;
                }
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;30mNote: Names of private residents are not in any free public dataset.\u001b[0m\n`;
            result += `\u001b[1;30mThis report only shows publicly registered businesses and notable\u001b[0m\n`;
            result += `\u001b[1;30mpublic-figure connections (Wikipedia/Wikidata).\u001b[0m\n`;
            result += `\`\`\``;

            await message.edit(result).catch(() => {});
            return;
        }

        // ── WHO IS <full name> — biographical + family OSINT via Wikidata ────
        if (command === 'who' && args[0]?.toLowerCase() === 'is') {
            const name = args.slice(1).join(' ').trim();
            if (!name) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}who is <full name>\u001b[0m\n\u001b[1;30mExample: ${prefix}who is Elon Musk\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] WHO IS: ${name}\u001b[0m\n\u001b[1;30m> Searching Wikidata + Wikipedia...\u001b[0m\n\`\`\``).catch(() => {});

            const hit = await wdSearchPerson(name);
            if (!hit) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No public record found for "${name}".\u001b[0m\n\u001b[1;30mThis lookup only finds notable / public figures (no private-individual data exists in any free public API).\u001b[0m\n\`\`\``).catch(() => {});
            }

            const subj = (await wdGetEntities([hit.id]))[hit.id];
            if (!subj) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not load entity ${hit.id}.\u001b[0m\n\`\`\``).catch(() => {});
            }

            // Collect all related entity IDs we need labels for
            const fatherIds  = wdClaimIds(subj, 'P22');
            const motherIds  = wdClaimIds(subj, 'P25');
            const spouseIds  = wdClaimIds(subj, 'P26');
            const childIds   = wdClaimIds(subj, 'P40');
            const siblingIds = wdClaimIds(subj, 'P3373');
            const occIds     = wdClaimIds(subj, 'P106');
            const citIds     = wdClaimIds(subj, 'P27');
            const pobIds     = wdClaimIds(subj, 'P19');
            const podIds     = wdClaimIds(subj, 'P20');
            const genderIds  = wdClaimIds(subj, 'P21');

            const allIds = Array.from(new Set([
                ...fatherIds, ...motherIds, ...spouseIds, ...childIds, ...siblingIds,
                ...occIds, ...citIds, ...pobIds, ...podIds, ...genderIds,
            ]));
            const related = await wdGetEntities(allIds);
            const labelOf = (id: string) => related[id]?.labels?.en?.value || id;
            const descOf  = (id: string) => related[id]?.descriptions?.en?.value || '';

            const dob = wdClaimTime(subj, 'P569');
            const dod = wdClaimTime(subj, 'P570');

            // Pull a short bio summary from Wikipedia (use the Wikidata label as title)
            const bio = await wikiSummary(hit.label);
            const bioShort = bio ? bio.split('. ').slice(0, 2).join('. ') + (bio.includes('.') ? '.' : '') : '';

            const fmtList = (ids: string[], max = 10) => {
                if (ids.length === 0) return '—';
                const names = ids.slice(0, max).map(labelOf);
                const extra = ids.length > max ? ` (+${ids.length - max} more)` : '';
                return names.join(', ') + extra;
            };
            const fmtFamily = (ids: string[], max = 10) => {
                if (ids.length === 0) return '—';
                return ids.slice(0, max).map(id => {
                    const d = descOf(id);
                    return d ? `${labelOf(id)} (${d})` : labelOf(id);
                }).join('\n               ') + (ids.length > max ? `\n               (+${ids.length - max} more)` : '');
            };

            const wikidataUrl = `https://www.wikidata.org/wiki/${hit.id}`;
            const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.label.replace(/ /g, '_'))}`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║          NETRUNNER · WHO IS REPORT           ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mTarget:\u001b[0m ${hit.label}\n`;
            if (hit.description) result += `\u001b[1;30m${hit.description}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;

            result += `\u001b[1;36m[ IDENTITY ]\u001b[0m\n`;
            result += `  \u001b[1;33mName:\u001b[0m         ${hit.label}\n`;
            result += `  \u001b[1;33mGender:\u001b[0m       ${genderIds.length ? labelOf(genderIds[0]) : '—'}\n`;
            result += `  \u001b[1;33mOccupation:\u001b[0m   ${fmtList(occIds, 6)}\n`;
            result += `  \u001b[1;33mCitizenship:\u001b[0m  ${fmtList(citIds, 6)}\n`;
            result += `  \u001b[1;33mBorn:\u001b[0m         ${dob || '—'}${pobIds.length ? `, ${labelOf(pobIds[0])}` : ''}\n`;
            if (dod || podIds.length) {
                result += `  \u001b[1;33mDied:\u001b[0m         ${dod || '—'}${podIds.length ? `, ${labelOf(podIds[0])}` : ''}\n`;
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ FAMILY ]\u001b[0m\n`;
            result += `  \u001b[1;33mFather:\u001b[0m       ${fmtFamily(fatherIds, 5)}\n`;
            result += `  \u001b[1;33mMother:\u001b[0m       ${fmtFamily(motherIds, 5)}\n`;
            result += `  \u001b[1;33mSpouse(s):\u001b[0m    ${fmtFamily(spouseIds, 8)}\n`;
            result += `  \u001b[1;33mChildren:\u001b[0m     ${fmtFamily(childIds, 15)}\n`;
            result += `  \u001b[1;33mSiblings:\u001b[0m     ${fmtFamily(siblingIds, 15)}\n`;

            if (bioShort) {
                result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
                result += `\u001b[1;36m[ BIO ]\u001b[0m\n`;
                // Wrap bio at ~72 chars per line for readability in Discord
                const words = bioShort.split(/\s+/);
                let line = '  ';
                for (const w of words) {
                    if ((line + w).length > 72) { result += line.trimEnd() + '\n'; line = '  '; }
                    line += w + ' ';
                }
                if (line.trim()) result += line.trimEnd() + '\n';
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ SOURCES ]\u001b[0m\n`;
            result += `  \u001b[1;32mWikidata:\u001b[0m  ${wikidataUrl}\n`;
            result += `  \u001b[1;32mWikipedia:\u001b[0m ${wikiUrl}\n`;
            result += `\`\`\``;

            await message.edit(result).catch(() => {});
            return;
        }

        if (command === 'ip' && args[0]?.toLowerCase() === 'check') {
            const ip = args[1];
            if (!ip) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}ip check <address>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] GEOLOCATING: ${ip}\u001b[0m\n\u001b[1;30m> Querying ip-api.com + ipinfo.io...\u001b[0m\n\`\`\``);

            const [main, info] = await Promise.all([
                ipApiLookup(ip),
                ipInfoLookup(ip),
            ]);

            if (!main || main.status === 'fail') {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid IP or lookup failed.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const lat = Number(main.lat);
            const lon = Number(main.lon);
            const mapUrl = staticMapUrl(lat, lon, 11);
            const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            const osmUrl = osmEmbedUrl(lat, lon);

            // Reverse-geocode to get the nearest street name at the (approximate) coords
            const geo = await nominatimReverse(lat, lon);
            const ga = geo?.address || {};
            const streetName = ga.road || ga.pedestrian || ga.footway || ga.path || '—';

            // ipinfo.io returns a "loc" string like "37.7749,-122.4194"; sometimes also a "postal"
            const infoLoc = info?.loc || `${lat},${lon}`;
            const infoPostal = info?.postal || main.zip || ga.postcode || '—';
            const infoCity = info?.city || main.city || '—';
            const infoRegion = info?.region || main.regionName || '—';
            const infoCountry = info?.country || main.countryCode || '—';

            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) =>
                `  \u001b[1;33m${pad(label + ':', 12)}\u001b[0m ${value}\n`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║          NETRUNNER · IP INTEL REPORT         ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mTarget:\u001b[0m ${main.query}\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;

            result += `\u001b[1;36m[ GEOLOCATION ]\u001b[0m\n`;
            result += row('Country',  `${main.country || infoCountry} (${main.countryCode || infoCountry})`);
            result += row('Region',   `${main.regionName || infoRegion}${main.region ? ` (${main.region})` : ''}`);
            result += row('City',     `${main.city || infoCity}`);
            result += row('Street',   `${streetName}`);
            result += row('Address',  `${geo?.display_name || '—'}`);
            result += row('Postcode', `${infoPostal}`);
            result += row('Coords',   `${lat}, ${lon}`);
            result += row('ipinfo',   `${infoLoc}`);
            result += row('Timezone', `${main.timezone || info?.timezone || '—'}`);
            result += `  \u001b[1;30m(approximate — IP geolocation is city/ISP-level, not a street address)\u001b[0m\n`;

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ NETWORK ]\u001b[0m\n`;
            result += row('ISP',      `${main.isp || '—'}`);
            result += row('Org',      `${main.org || info?.org || '—'}`);
            result += row('AS',       `${main.as || '—'}`);
            result += row('AS Name',  `${main.asname || '—'}`);
            result += row('Hostname', `${main.reverse || info?.hostname || '—'}`);

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ FLAGS ]\u001b[0m\n`;
            result += row('Mobile',     main.mobile  ? '\u001b[1;31mYES\u001b[0m' : 'No');
            result += row('Proxy/VPN',  main.proxy   ? '\u001b[1;31mYES\u001b[0m' : 'No');
            result += row('Hosting/DC', main.hosting ? '\u001b[1;31mYES (Datacenter/VPS)\u001b[0m' : 'No');
            if (info?.bogon) result += row('Bogon', '\u001b[1;31mYES (reserved/private range)\u001b[0m');
            if (info?.anycast) result += row('Anycast', '\u001b[1;33mYES\u001b[0m');

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ MAP ]\u001b[0m\n`;
            result += `  \u001b[1;32mGoogle:\u001b[0m ${googleMapsUrl}\n`;
            result += `  \u001b[1;32mOSM:\u001b[0m    ${osmUrl}\n`;

            // Extra OSINT sources (Breachhub + Luperly + Swatted.wtf)
            const extra = await extraOsintBlock(ip, 'ip');
            if (extra) result += extra;

            result += `\`\`\``;

            await message.edit(result).catch(() => {});

            // Send a zoomed-out static map image with a pin, then the Google Maps link
            await message.channel.send(staticMapUrl(lat, lon, 11)).catch(() => {});
            await message.channel.send(`📍 ${googleMapsUrl}`).catch(() => {});
            return;
        }

        // ── OSINT FULL DUMPS ──────────────────────────────────────────────────
        if (command === 'osint') {
            const sub1 = args[0]?.toLowerCase(); // user / server / token / ip
            const sub2 = args[1]?.toLowerCase(); // full
            const sub3 = args[2]?.toLowerCase(); // dump / report
            const target = args[3];

            // .osint user full dump <@user>
            if (sub1 === 'user' && sub2 === 'full') {
                const mention = target || args[3];
                const userId = (mention || '').replace(/[<@!>]/g, '');
                if (!userId) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint user full dump <@user>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] DUMPING USER: ${userId}\u001b[0m\n\`\`\``);

                try {
                    const user = await client.users.fetch(userId, { force: true });
                    const member = message.guild ? await message.guild.members.fetch(userId).catch(() => null) : null;

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] USER FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                    result += `\u001b[1;33mTag:\u001b[0m          ${user.tag}\n`;
                    result += `\u001b[1;33mUsername:\u001b[0m     ${user.username}\n`;
                    result += `\u001b[1;33mID:\u001b[0m           ${user.id}\n`;
                    result += `\u001b[1;33mBot:\u001b[0m          ${user.bot ? 'Yes' : 'No'}\n`;
                    result += `\u001b[1;33mCreated:\u001b[0m      ${user.createdAt.toUTCString()}\n`;
                    const tsSeconds = Math.floor(user.createdTimestamp / 1000);
                    result += `\u001b[1;33mUnix TS:\u001b[0m      ${tsSeconds}\n`;

                    // Snowflake decode
                    const snowflakeTs = Math.floor(user.createdTimestamp);
                    const workerBits = (BigInt(userId) >> BigInt(17)) & BigInt(0x1f);
                    const processBits = (BigInt(userId) >> BigInt(12)) & BigInt(0x1f);
                    result += `\u001b[1;33mWorker ID:\u001b[0m    ${workerBits}\n`;
                    result += `\u001b[1;33mProcess ID:\u001b[0m   ${processBits}\n`;

                    if (user.flags) {
                        const flags = user.flags.toArray();
                        result += `\u001b[1;33mBadges:\u001b[0m       ${flags.join(', ') || 'None'}\n`;
                    }

                    const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 4096 });
                    result += `\u001b[1;33mAvatar:\u001b[0m       ${avatarUrl}\n`;

                    const bannerUrl = user.bannerURL({ dynamic: true, size: 4096 });
                    if (bannerUrl) result += `\u001b[1;33mBanner:\u001b[0m       ${bannerUrl}\n`;
                    if ((user as any).accentColor) result += `\u001b[1;33mAccent Color:\u001b[0m #${((user as any).accentColor).toString(16).padStart(6, '0')}\n`;

                    if (member) {
                        result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                        result += `\u001b[1;36m[SERVER MEMBER DATA]\u001b[0m\n`;
                        result += `\u001b[1;33mNickname:\u001b[0m     ${member.nickname || 'None'}\n`;
                        result += `\u001b[1;33mJoined:\u001b[0m       ${member.joinedAt?.toUTCString() || 'Unknown'}\n`;
                        const roles = member.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => r.name);
                        result += `\u001b[1;33mRoles:\u001b[0m        ${roles.slice(0, 10).join(', ') || 'None'}\n`;
                        result += `\u001b[1;33mBoosting:\u001b[0m     ${member.premiumSince ? `Since ${member.premiumSince.toUTCString()}` : 'No'}\n`;
                        result += `\u001b[1;33mPending:\u001b[0m      ${member.pending ? 'Yes' : 'No'}\n`;
                        if (member.communicationDisabledUntil) result += `\u001b[1;31mMuted Until:\u001b[0m  ${member.communicationDisabledUntil.toUTCString()}\n`;
                    }

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                    // Send avatar as image
                    await message.channel.send(avatarUrl).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch user data.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint server full dump
            if (sub1 === 'server' && sub2 === 'full') {
                const guild = message.guild;
                if (!guild) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] This command only works in servers.\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] DUMPING SERVER: ${guild.name}\u001b[0m\n\`\`\``);

                try {
                    const owner = await guild.fetchOwner().catch(() => null);
                    const bans = await guild.bans.fetch().catch(() => null);
                    const invites = await guild.invites.fetch().catch(() => null);
                    const webhooks = await guild.fetchWebhooks().catch(() => null);

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] SERVER FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                    result += `\u001b[1;33mName:\u001b[0m          ${guild.name}\n`;
                    result += `\u001b[1;33mID:\u001b[0m            ${guild.id}\n`;
                    result += `\u001b[1;33mOwner:\u001b[0m         ${owner?.user.tag || guild.ownerId}\n`;
                    result += `\u001b[1;33mOwner ID:\u001b[0m      ${guild.ownerId}\n`;
                    result += `\u001b[1;33mCreated:\u001b[0m       ${guild.createdAt.toUTCString()}\n`;
                    result += `\u001b[1;33mMembers:\u001b[0m       ${guild.memberCount}\n`;
                    result += `\u001b[1;33mChannels:\u001b[0m      ${guild.channels?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mRoles:\u001b[0m         ${guild.roles?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mEmojis:\u001b[0m        ${guild.emojis?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mBoosts:\u001b[0m        ${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier || 0})\n`;
                    result += `\u001b[1;33mVerification:\u001b[0m  ${guild.verificationLevel}\n`;
                    result += `\u001b[1;33mNSFW Level:\u001b[0m    ${guild.nsfwLevel}\n`;
                    result += `\u001b[1;33mVanity URL:\u001b[0m    ${guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : 'None'}\n`;
                    result += `\u001b[1;33mDescription:\u001b[0m   ${guild.description || 'None'}\n`;
                    if (bans) result += `\u001b[1;33mBans:\u001b[0m          ${bans.size}\n`;
                    if (invites) result += `\u001b[1;33mActive Invites:\u001b[0m ${invites.size}\n`;
                    if (webhooks) result += `\u001b[1;33mWebhooks:\u001b[0m      ${webhooks.size}\n`;

                    const features = guild.features;
                    if (features.length > 0) {
                        result += `\u001b[1;33mFeatures:\u001b[0m      ${features.join(', ')}\n`;
                    }

                    const iconUrl = guild.iconURL({ dynamic: true, size: 4096 });
                    if (iconUrl) result += `\u001b[1;33mIcon:\u001b[0m          ${iconUrl}\n`;
                    const bannerUrl = guild.bannerURL({ dynamic: true, size: 4096 });
                    if (bannerUrl) result += `\u001b[1;33mBanner:\u001b[0m        ${bannerUrl}\n`;

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                    if (iconUrl) await message.channel.send(iconUrl).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to dump server data.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint token full dump <token>
            if (sub1 === 'token' && sub2 === 'full') {
                const token = target || args[3];
                if (!token) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint token full dump <token>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] ANALYZING TOKEN...\u001b[0m\n\`\`\``);

                try {
                    // Decode JWT-like token parts (Discord tokens are base64url encoded)
                    const parts = token.split('.');
                    let userId = '';
                    let decodedTs = '';
                    if (parts.length >= 2) {
                        try {
                            userId = Buffer.from(parts[0], 'base64').toString('utf8');
                            if (parts[1]) {
                                const tsBytes = Buffer.from(parts[1], 'base64');
                                if (tsBytes.length >= 4) {
                                    const tsNum = tsBytes.readUInt32BE(0);
                                    decodedTs = new Date((tsNum + 1293840000) * 1000).toUTCString();
                                }
                            }
                        } catch {}
                    }

                    // Validate against Discord API
                    const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: token }
                    });
                    const discordData: any = await discordRes.json();

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] TOKEN FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

                    if (discordData.id) {
                        result += `\u001b[1;32m[+] TOKEN VALID\u001b[0m\n`;
                        result += `\u001b[1;33mUsername:\u001b[0m      ${discordData.username}${discordData.discriminator !== '0' ? '#' + discordData.discriminator : ''}\n`;
                        result += `\u001b[1;33mID:\u001b[0m            ${discordData.id}\n`;
                        result += `\u001b[1;33mEmail:\u001b[0m         ${discordData.email || 'Not accessible'}\n`;
                        result += `\u001b[1;33mPhone:\u001b[0m         ${discordData.phone || 'None'}\n`;
                        result += `\u001b[1;33mMFA Enabled:\u001b[0m   ${discordData.mfa_enabled ? 'Yes' : 'No'}\n`;
                        result += `\u001b[1;33mVerified:\u001b[0m      ${discordData.verified ? 'Yes' : 'No'}\n`;
                        result += `\u001b[1;33mNitro:\u001b[0m         ${discordData.premium_type === 2 ? 'Nitro Boost' : discordData.premium_type === 1 ? 'Classic' : 'None'}\n`;
                        result += `\u001b[1;33mLocale:\u001b[0m        ${discordData.locale || 'Unknown'}\n`;
                        if (discordData.avatar) {
                            result += `\u001b[1;33mAvatar:\u001b[0m        https://cdn.discordapp.com/avatars/${discordData.id}/${discordData.avatar}.png\n`;
                        }
                        // Fetch billing info
                        const billingRes = await fetch('https://discord.com/api/v10/users/@me/billing/payment-sources', {
                            headers: { Authorization: token }
                        });
                        const billingData: any = await billingRes.json().catch(() => null);
                        if (Array.isArray(billingData) && billingData.length > 0) {
                            result += `\u001b[1;31mPayment Methods: ${billingData.length}\u001b[0m\n`;
                            billingData.slice(0, 3).forEach((pm: any) => {
                                result += `  \u001b[1;33m• ${pm.type === 1 ? 'Card' : pm.type === 2 ? 'PayPal' : 'Other'}\u001b[0m`;
                                if (pm.billing_address?.country) result += ` (${pm.billing_address.country})`;
                                if (pm.last_4) result += ` ****${pm.last_4}`;
                                result += `\n`;
                            });
                        }
                        // Guild count
                        const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                            headers: { Authorization: token }
                        });
                        const guildsData: any = await guildsRes.json().catch(() => null);
                        if (Array.isArray(guildsData)) {
                            result += `\u001b[1;33mGuilds:\u001b[0m        ${guildsData.length}\n`;
                        }
                    } else {
                        result += `\u001b[1;31m[!] TOKEN INVALID OR EXPIRED\u001b[0m\n`;
                        result += `\u001b[1;33mMessage:\u001b[0m ${discordData.message || 'Unknown error'}\n`;
                    }

                    if (userId) result += `\u001b[1;30mDecoded ID part: ${userId}\u001b[0m\n`;
                    if (decodedTs) result += `\u001b[1;30mToken issued ~: ${decodedTs}\u001b[0m\n`;

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Token analysis failed.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint ip full report <ip>
            if (sub1 === 'ip' && sub2 === 'full') {
                const ip = target || args[3];
                if (!ip) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint ip full report <ip>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] RUNNING FULL IP REPORT ON: ${ip}\u001b[0m\n\u001b[1;30m> Querying multiple sources...\u001b[0m\n\`\`\``);

                const [main, info] = await Promise.all([
                    ipApiLookup(ip),
                    ipInfoLookup(ip),
                ]);

                if (!main || main.status === 'fail') {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid IP or all lookups failed.\u001b[0m\n\`\`\``).catch(() => {});
                }

                const lat = Number(main.lat);
                const lon = Number(main.lon);
                const mapUrl = staticMapUrl(lat, lon, 11);
                const googleMapsUrl = `https://maps.google.com/?q=${lat},${lon}`;

                // Reverse-geocode coords to a street-level address via OpenStreetMap (public, ToS-compliant)
                const geo = await nominatimReverse(lat, lon);
                const ga = geo?.address || {};
                const streetName = ga.road || ga.pedestrian || ga.footway || ga.path || '—';
                const houseNum   = ga.house_number || '';
                const streetLine = houseNum ? `${houseNum} ${streetName}` : streetName;
                const neighborhood = ga.neighbourhood || ga.suburb || ga.quarter || '—';

                let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] FULL IP REPORT: ${main.query}\u001b[0m\n`;
                result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                result += `\u001b[1;36m[GEO]\u001b[0m\n`;
                result += `  \u001b[1;33mIP:\u001b[0m          ${main.query}\n`;
                result += `  \u001b[1;33mCountry:\u001b[0m     ${main.country} (${main.countryCode})\n`;
                result += `  \u001b[1;33mRegion:\u001b[0m      ${main.regionName} (${main.region})\n`;
                result += `  \u001b[1;33mCity:\u001b[0m        ${main.city}\n`;
                result += `  \u001b[1;33mNeighborhood:\u001b[0m ${neighborhood}\n`;
                result += `  \u001b[1;33mStreet:\u001b[0m      ${streetLine}\n`;
                result += `  \u001b[1;33mAddress:\u001b[0m     ${geo?.display_name || '—'}\n`;
                result += `  \u001b[1;33mPostcode:\u001b[0m    ${main.zip || ga.postcode || '—'}\n`;
                result += `  \u001b[1;33mCoords:\u001b[0m      ${lat}, ${lon}\n`;
                result += `  \u001b[1;33mTimezone:\u001b[0m    ${main.timezone}\n`;
                result += `  \u001b[1;30m(approximate — IP geolocation is city/ISP-level, not exact)\u001b[0m\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[NETWORK]\u001b[0m\n`;
                result += `  \u001b[1;33mISP:\u001b[0m         ${main.isp}\n`;
                result += `  \u001b[1;33mOrg:\u001b[0m         ${main.org || '—'}\n`;
                result += `  \u001b[1;33mAS:\u001b[0m          ${main.as || '—'}\n`;
                result += `  \u001b[1;33mASName:\u001b[0m      ${main.asname || '—'}\n`;
                result += `  \u001b[1;33mHostname:\u001b[0m    ${main.reverse || info?.hostname || '—'}\n`;
                if (info?.org) result += `  \u001b[1;33mProvider:\u001b[0m    ${info.org}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[FLAGS]\u001b[0m\n`;
                result += `  \u001b[1;33mMobile:\u001b[0m      ${main.mobile ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `  \u001b[1;33mProxy/VPN:\u001b[0m   ${main.proxy ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `  \u001b[1;33mHosting/DC:\u001b[0m  ${main.hosting ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[MAP]\u001b[0m\n`;
                result += `  ${googleMapsUrl}\n`;
                result += `\`\`\``;

                await message.edit(result).catch(() => {});
                // Send the Google Maps link so Discord embeds a preview
                await message.channel.send(`📍 ${googleMapsUrl}`).catch(() => {});
                return;
            }

            // osint discord <id> — multi-source Discord deep lookup
            if (args[0]?.toLowerCase() === 'discord' && args[1]) {
                // Accept both ".osint discord <id>" and legacy ".osint discord id <id>"
                const targetId = (args[1].toLowerCase() === 'id' ? args[2] : args[1])?.trim();
                if (!targetId || !/^\d{15,25}$/.test(targetId)) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint discord <discord_id>\u001b[0m\n\`\`\``).catch(() => {});
                }

                const C = (n: number) => `\u001b[1;${n}m`;
                const CY = C(36), YE = C(33), GR = C(32), RE = C(31), GY = C(30), WH = C(37), MA = C(35), RST = '\u001b[0m';
                const SUB = '─'.repeat(50);
                const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
                const row = (k: string, v: string) => `  ${YE}${pad(k + ':', 14)}${RST} ${v}\n`;
                const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

                await message.edit(`\`\`\`ansi\n${C(34)}[*] DISCORD OSINT: ${targetId}${RST}\n${GY}> Discord API · snowflake decode · snowid.lol · Snusbase · LeakCheck${RST}\n\`\`\``).catch(() => {});

                // Snowflake decode
                const DISCORD_EPOCH = 1420070400000n;
                let createdAt = 'Unknown';
                let ageDays   = 0;
                try {
                    const bigId = BigInt(targetId);
                    const ts = Number((bigId >> 22n) + DISCORD_EPOCH);
                    createdAt = new Date(ts).toUTCString();
                    ageDays = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
                } catch (_) {}

                // Fetch Discord user (force = bypass cache, includes banner/accent_color)
                let user: any = null;
                try { user = await client.users.fetch(targetId, { force: true }); } catch (_) {}

                // snowid.lol fast lookup (best-effort)
                let snowid: any = null;
                try {
                    const resp = await fetch('https://snowid.lol/api/lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ discordId: targetId, fast: true }),
                    });
                    const raw = await resp.text();
                    try { snowid = JSON.parse(raw); } catch (_) {}
                } catch (_) {}

                // Determine search terms for breach DBs
                const searchTerms: { term: string; type: string }[] = [];
                searchTerms.push({ term: targetId, type: 'username' }); // some leak DBs index discord IDs as usernames
                if (user?.username) {
                    searchTerms.push({ term: user.username, type: 'username' });
                    if (user.discriminator && user.discriminator !== '0') {
                        searchTerms.push({ term: `${user.username}#${user.discriminator}`, type: 'username' });
                    }
                }

                // Fan out to breach DBs in parallel
                const breachQueries: Promise<{ src: string; data: any; term: string }>[] = [];
                for (const t of searchTerms) {
                    breachQueries.push(snusbaseSearch(t.term, t.type).then(d => ({ src: 'Snusbase',      data: d, term: t.term })));
                    breachQueries.push(snusbaseBetaSearch(t.term, t.type).then(d => ({ src: 'Snusbase Beta', data: d, term: t.term })));
                    breachQueries.push(leakcheckQuery(t.term, t.type).then(d => ({ src: 'LeakCheck',     data: d, term: t.term })));
                }
                const breachResults = await Promise.all(breachQueries);

                // Aggregate
                const breachSources = new Set<string>();
                const emails    = new Set<string>();
                const passwords = new Set<string>();
                const ips       = new Set<string>();
                const altUsers  = new Set<string>();
                const names     = new Set<string>();
                let recordCount = 0;

                for (const { src, data } of breachResults) {
                    if (src === 'LeakCheck') {
                        if (data?.success && Array.isArray(data.result)) {
                            for (const e of data.result) {
                                recordCount++;
                                const sn = typeof e.source === 'object' ? e.source?.name : e.source;
                                if (sn) breachSources.add(sn);
                                if (e.email)    emails.add(e.email);
                                if (e.password) passwords.add(e.password);
                                if (e.username) altUsers.add(e.username);
                                if (e.first_name && e.last_name) names.add(`${e.first_name} ${e.last_name}`);
                                else if (e.name) names.add(e.name);
                            }
                        }
                    } else {
                        if (data?.results) {
                            for (const [db, rows] of Object.entries<any>(data.results)) {
                                breachSources.add(db);
                                for (const e of (rows || [])) {
                                    recordCount++;
                                    if (e.email)    emails.add(e.email);
                                    if (e.password) passwords.add(e.password);
                                    if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                                    if (e.username) altUsers.add(e.username);
                                    if (e.name)     names.add(e.name);
                                }
                            }
                        }
                    }
                }

                let r = `\`\`\`ansi\n`;
                r += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
                r += `${CY}║              DISCORD ID · OSINT                  ║${RST}\n`;
                r += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
                r += `${WH}Target ID:${RST} ${targetId}\n`;

                // PROFILE
                r += head('DISCORD PROFILE');
                if (user) {
                    const flags  = user.flags?.toArray().join(', ') || 'None';
                    const avatar = user.avatar
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=512`
                        : 'Default';
                    const banner = user.banner
                        ? `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${user.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`
                        : 'None';
                    r += row('Tag',         user.tag);
                    r += row('Username',    user.username);
                    r += row('Display',     user.displayName || user.globalName || user.username);
                    r += row('Discrim',     user.discriminator || '0');
                    r += row('Bot',         user.bot ? `${YE}Yes${RST}` : 'No');
                    r += row('System',      user.system ? 'Yes' : 'No');
                    r += row('Badges',      flags);
                    if (user.accentColor) r += row('Accent',  `#${user.accentColor.toString(16).padStart(6, '0')}`);
                    r += row('Avatar',      avatar);
                    r += row('Banner',      banner);
                } else {
                    r += `  ${RE}— user could not be fetched (private / blocked / invalid) —${RST}\n`;
                }

                // SNOWFLAKE
                r += head('SNOWFLAKE METADATA');
                r += row('Created',  createdAt);
                r += row('Age',      `${ageDays} days (${(ageDays / 365).toFixed(2)} yrs)`);
                try {
                    const bigId = BigInt(targetId);
                    r += row('Worker',   String((bigId >> 17n) & 0x1Fn));
                    r += row('Process',  String((bigId >> 12n) & 0x1Fn));
                    r += row('Increment', String(bigId & 0xFFFn));
                } catch (_) {}

                // SNOWID.LOL
                r += head('SNOWID.LOL');
                if (snowid && !snowid.error && Object.keys(snowid).length > 0) {
                    const entries = Object.entries(snowid)
                        .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
                        .slice(0, 12);
                    if (entries.length === 0) r += `  ${GY}— no extra fields —${RST}\n`;
                    else entries.forEach(([k, v]) => r += row(k, String(v)));
                } else if (snowid?.error) {
                    r += `  ${GY}${snowid.error}${RST}\n`;
                } else {
                    r += `  ${GY}— unreachable —${RST}\n`;
                }
                r += row('Profile',  `https://snowid.lol/?id=${targetId}`);

                // BREACH INTEL
                r += head('BREACH INTEL (Snusbase + Beta + LeakCheck)');
                r += row('Sources',   `${breachSources.size}`);
                r += row('Records',   `${recordCount}`);
                r += row('Emails',    `${emails.size}`);
                r += row('Passwords', `${passwords.size}`);
                r += row('IPs',       `${ips.size}`);
                r += row('Aliases',   `${altUsers.size}`);

                if (emails.size) {
                    r += `\n  ${YE}Emails:${RST}\n`;
                    Array.from(emails).slice(0, 6).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (altUsers.size) {
                    r += `  ${YE}Aliases:${RST}\n`;
                    Array.from(altUsers).slice(0, 6).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (names.size) {
                    r += `  ${YE}Names:${RST}\n`;
                    Array.from(names).slice(0, 4).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (ips.size) {
                    r += `  ${YE}IPs:${RST}\n`;
                    Array.from(ips).slice(0, 4).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (passwords.size) {
                    r += `  ${YE}Passwords:${RST}\n`;
                    Array.from(passwords).slice(0, 8).forEach(e => r += `    ${RE}•${RST} ${e}\n`);
                }
                if (breachSources.size) {
                    r += `  ${YE}Breach DBs:${RST}\n`;
                    Array.from(breachSources).slice(0, 12).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                    if (breachSources.size > 12) r += `    ${GY}...and ${breachSources.size - 12} more${RST}\n`;
                }

                // Extra sources: Breachhub + Luperly + Swatted.wtf
                // Try the discord ID first; if a username was resolved, also try that
                const extraId = await extraOsintBlock(targetId, 'discord');
                if (extraId) r += extraId;
                if (user?.username) {
                    const extraName = await extraOsintBlock(user.username, 'username');
                    if (extraName) r += extraName;
                }

                r += `${CY}${SUB}${RST}\n\`\`\``;

                // Send (split if needed)
                const send = async (text: string) => {
                    if (text.length <= 1990) return message.edit(text).catch(() => {});
                    const lines = text.split('\n');
                    let buf = '```ansi\n';
                    let first = true;
                    for (const line of lines) {
                        if (line === '```ansi' || line === '```') continue;
                        if ((buf + line + '\n```').length > 1900) {
                            buf += '```';
                            if (first) { await message.edit(buf).catch(() => {}); first = false; }
                            else       { await message.channel.send(buf).catch(() => {}); }
                            buf = '```ansi\n';
                        }
                        buf += line + '\n';
                    }
                    buf += '```';
                    if (first) await message.edit(buf).catch(() => {});
                    else       await message.channel.send(buf).catch(() => {});
                };
                await send(r);
                return;
            }

            // Unknown osint subcommand
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Unknown osint command. Use ${prefix}help osint\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── TIKTOK VIEWS BOOSTER ──────────────────────────────────────────────
        if (command === 'tiktok' && args[0]?.toLowerCase() === 'views') {
            const link = args[1];
            const amountRaw = args[2];
            const amount = Number(amountRaw);

            if (!link || !amountRaw) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}tiktok views <video_link> <amount>\u001b[0m\n\u001b[1;30m> Amount must be between 100 and 5000\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            if (!isValidUrl(link)) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid URL. Provide a valid TikTok video link.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            if (!Number.isInteger(amount) || amount < 100 || amount > 5000) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Amount must be an integer between 100 and 5000.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            await message.edit(
                `\`\`\`ansi\n` +
                `\u001b[1;36m[TIKTOK VIEWS BOOSTER]\u001b[0m\n` +
                `\u001b[1;30m${'─'.repeat(36)}\u001b[0m\n` +
                `\u001b[1;33m  Link  \u001b[0m· ${link}\n` +
                `\u001b[1;33m  Views \u001b[0m· ${amount}\n` +
                `\u001b[1;34m[*] Submitting order...\u001b[0m\n` +
                `\`\`\``
            ).catch(() => {});

            const username = client.user?.tag || 'unknown';
            const result = await placeTiktokOrder(username, link, amount);

            if (result.ok) {
                await message.edit(
                    `\`\`\`ansi\n` +
                    `\u001b[1;36m[TIKTOK VIEWS BOOSTER]\u001b[0m\n` +
                    `\u001b[1;30m${'─'.repeat(36)}\u001b[0m\n` +
                    `\u001b[1;32m[OK] Order submitted\u001b[0m\n` +
                    `\u001b[1;33m  Order ID \u001b[0m· ${result.orderId}\n` +
                    `\u001b[1;33m  Link     \u001b[0m· ${link}\n` +
                    `\u001b[1;33m  Views    \u001b[0m· ${amount}\n` +
                    `\u001b[1;30m> Delivery within 12h. For more views, get a key:\u001b[0m\n` +
                    `\u001b[1;36m  ${TIKTOK_BOOSTER_INVITE}\u001b[0m\n` +
                    `\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(
                    `\`\`\`ansi\n` +
                    `\u001b[1;36m[TIKTOK VIEWS BOOSTER]\u001b[0m\n` +
                    `\u001b[1;30m${'─'.repeat(36)}\u001b[0m\n` +
                    `\u001b[1;31m[!] Order failed: ${result.error}\u001b[0m\n` +
                    `\u001b[1;30m> The order receipt was still logged.\u001b[0m\n` +
                    `\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── AFK ───────────────────────────────────────────────────────────────
        if (command === 'afk') {
            // .afk off → same as .unafk
            if (args[0]?.toLowerCase() === 'off') {
                const updated = { ...config, isAfk: false, afkMessage: '', afkSince: null } as any;
                clientConfigs.set(configId, updated);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] You're not AFK anymore.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const reason = fullArgs.trim() || "I'm AFK right now.";
            const updated = { ...config, isAfk: true, afkMessage: reason, afkSince: Date.now() } as any;
            clientConfigs.set(configId, updated);
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] AFK mode enabled.\u001b[0m\n\u001b[1;33mReason:\u001b[0m ${reason}\n\`\`\``).catch(() => {});
            return;
        }

        // ── UNAFK ─────────────────────────────────────────────────────────────
        if (command === 'unafk') {
            const updated = { ...config, isAfk: false, afkMessage: '', afkSince: null } as any;
            clientConfigs.set(configId, updated);
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] You're not AFK anymore.\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── STATUSMOVER ───────────────────────────────────────────────────────
        if (command === 'statusmover') {
            const sub = fullArgs.trim().toLowerCase();

            // Stop
            if (sub === 'stop' || sub === '') {
                const existing = statusMoverIntervals.get(configId);
                if (existing) {
                    clearInterval(existing);
                    statusMoverIntervals.delete(configId);
                    // Clear custom status
                    try { client.user.setPresence({ status: 'online', afk: false, activities: [] }); } catch (_) {}
                }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Status mover stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            // Parse {word1,word2,...} — allow with or without braces
            const raw = fullArgs.trim().replace(/^\{/, '').replace(/\}$/, '');
            const words = raw.split(',').map(w => w.trim()).filter(w => w.length > 0);

            if (words.length < 2) {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}statusmover {word1,word2,word3}\u001b[0m\n` +
                    `\u001b[1;30mProvide at least 2 words separated by commas.\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            // Clear any existing mover
            const old = statusMoverIntervals.get(configId);
            if (old) clearInterval(old);

            let index = 0;
            const applyStatus = () => {
                if (!client.user) return;
                try {
                    const cs = new CustomStatus(client).setState(words[index]);
                    client.user.setPresence({
                        status: 'online',
                        afk: false,
                        activities: [cs],
                    });
                } catch (e) {
                    console.error(`[StatusMover] setPresence failed:`, e);
                }
                index = (index + 1) % words.length;
            };

            applyStatus();
            const interval = setInterval(applyStatus, 2000);
            statusMoverIntervals.set(configId, interval);

            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Status mover started.\u001b[0m\n` +
                `\u001b[1;33mCycling:\u001b[0m ${words.join(' → ')}\n` +
                `\u001b[1;30mEvery 2 seconds · Use ${prefix}statusmover stop to cancel\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── SNIPE ─────────────────────────────────────────────────────────────
        if (command === 'snipe') {
            const requestedIndex = Math.max(1, parseInt(args[0]) || 1) - 1; // 0-based
            const channelSnipes = snipedMessages.get(configId)?.get(message.channel.id);
            if (!channelSnipes || channelSnipes.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No recently deleted messages in this channel.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            if (requestedIndex >= channelSnipes.length) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Only ${channelSnipes.length} deleted message(s) cached in this channel.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const snipe = channelSnipes[requestedIndex];
            const ago = Math.floor((Date.now() - snipe.timestamp) / 1000);
            const label = requestedIndex === 0 ? 'Last Deleted' : `Deleted #${requestedIndex + 1}`;
            await message.edit(
                `\`\`\`ansi\n\u001b[1;36m[SNIPE] ${label}\u001b[0m\n` +
                `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n` +
                `\u001b[1;33mAuthor:\u001b[0m  ${snipe.author}\n` +
                `\u001b[1;33mContent:\u001b[0m ${snipe.content}\n` +
                `\u001b[1;33mDeleted:\u001b[0m ${ago}s ago\n` +
                `\`\`\``
            ).catch(() => {});
            return;
        }

        // ── BULLY ─────────────────────────────────────────────────────────────
        if (command === 'bully') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                const bi = bullyIntervals.get(configId);
                if (bi) { clearInterval(bi.interval); bullyIntervals.delete(configId); }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Bully mode stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            const intervalSecs = Math.max(1, parseInt(args[1]) || 5);
            if (!userId || !/^\d+$/.test(userId)) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}bully <@user> [interval_sec]\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const existing = bullyIntervals.get(configId);
            if (existing) clearInterval(existing.interval);
            const channelId = message.channel.id;
            const interval = setInterval(async () => {
                try {
                    const ch = client.channels.cache.get(channelId) as any
                        || await client.channels.fetch(channelId).catch(() => null) as any;
                    if (ch && typeof ch.send === 'function') {
                        await ch.send(`<@${userId}>`).catch(() => {});
                    }
                } catch { /* channel gone, interval will stay until .bully stop */ }
            }, intervalSecs * 1000);
            bullyIntervals.set(configId, { interval, channelId });
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Bullying <@${userId}> every ${intervalSecs}s.\u001b[0m\n` +
                `\u001b[1;30mUse ${prefix}bully stop to stop.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── SPAM ──────────────────────────────────────────────────────────────
        if (command === 'spam') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                activeSpams.set(configId, false);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Spam stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const count = parseInt(args[0]);
            const spamMsg = args.slice(1).join(' ');
            if (isNaN(count) || count < 1 || !spamMsg) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}spam <count> <message>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            activeSpams.set(configId, true);
            await message.delete().catch(() => {});
            for (let i = 0; i < Math.min(count, 500); i++) {
                if (!activeSpams.get(configId)) break;
                try {
                    await message.channel.send(spamMsg);
                } catch (e: any) {
                    // If rate-limited, wait exactly as long as Discord says then retry
                    const retryAfter = e?.response?.data?.retry_after ?? e?.retryAfter;
                    if (retryAfter) {
                        await new Promise(r => setTimeout(r, retryAfter * 1000 + 100));
                        await message.channel.send(spamMsg).catch(() => {});
                    }
                    // Any other error — skip this message and keep going
                }
                // 80ms baseline — ~10x faster than the old 800ms, lets discord.js
                // handle its own internal rate-limit queue for the rest
                await new Promise(r => setTimeout(r, 80));
            }
            activeSpams.set(configId, false);
            return;
        }

        // ── AUTOREACT ─────────────────────────────────────────────────────────
        if (command === 'autoreact') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                autoReactConfigs.delete(configId);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Auto-react disabled.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            // All remaining args after the mention are emojis (superreact support)
            const rawEmojis = args.slice(1);
            if (!userId || rawEmojis.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}autoreact <@user> <emoji> [emoji2 ...] | ${prefix}autoreact stop\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            // Normalize each emoji: strip <:name:id> or <a:name:id> wrappers
            const emojis = rawEmojis.map((e: string) => {
                const m = e.match(/^<a?:(\w+:\d+)>$/);
                return m ? m[1] : e;
            });
            autoReactConfigs.set(configId, { userOption: userId, emojis });
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Auto-reacting to <@${userId}> with ${rawEmojis.join(' ')}\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── TRAP ──────────────────────────────────────────────────────────────
        if (command === 'trap') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                const mention = args[1];
                const userId = mention?.replace(/[<@!>]/g, '');
                if (userId) {
                    trappedUsers.get(configId)?.delete(userId);
                } else {
                    trappedUsers.delete(configId);
                }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Trap stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            if (!userId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}trap <@user> | ${prefix}trap stop [<@user>]\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            try {
                const targetUser = await client.users.fetch(userId);
                const gc = await (client as any).user?.createGroupDM([userId]).catch(() => null);
                if (!gc) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to create GC with that user.\u001b[0m\n\`\`\``).catch(() => {});
                    return;
                }
                if (!trappedUsers.has(configId)) trappedUsers.set(configId, new Map());
                trappedUsers.get(configId)!.set(userId, gc.id);
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Trapped ${targetUser.tag} in GC.\u001b[0m\n` +
                    `\u001b[1;33mGC ID:\u001b[0m ${gc.id}\n` +
                    `\u001b[1;30mThey will be re-invited if they leave.\u001b[0m\n\`\`\``
                ).catch(() => {});
            } catch {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to trap user.\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── GC ────────────────────────────────────────────────────────────────
        if (command === 'gc') {
            const sub1 = args[0]?.toLowerCase();
            const sub2 = args[1]?.toLowerCase();
            const param = args[2];

            if (sub1 === 'allowall') {
                const enable = sub2 === 'on';
                await storage.updateBot(configId, { gcAllowAll: enable });
                clientConfigs.set(configId, { ...config, gcAllowAll: enable });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] GC Allow-All: ${enable ? 'ON' : 'OFF'}\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            if (sub1 === 'whitelist') {
                const currentWl: string[] = (config.whitelistedGcs as string[]) || [];
                if (sub2 === 'add' && param) {
                    if (!currentWl.includes(param)) currentWl.push(param);
                    await storage.updateBot(configId, { whitelistedGcs: currentWl });
                    clientConfigs.set(configId, { ...config, whitelistedGcs: currentWl });
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] GC ${param} whitelisted.\u001b[0m\n\`\`\``).catch(() => {});
                } else if (sub2 === 'remove' && param) {
                    const newWl = currentWl.filter(id => id !== param);
                    await storage.updateBot(configId, { whitelistedGcs: newWl });
                    clientConfigs.set(configId, { ...config, whitelistedGcs: newWl });
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] GC ${param} removed from whitelist.\u001b[0m\n\`\`\``).catch(() => {});
                } else if (sub2 === 'list') {
                    const list = currentWl.length > 0 ? currentWl.join('\n  ') : 'None';
                    await message.edit(
                        `\`\`\`ansi\n\u001b[1;36m[GC Whitelist]\u001b[0m\n  ${list}\n\`\`\``
                    ).catch(() => {});
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gc whitelist add/remove/list [gcId]\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gc allowall on/off | ${prefix}gc whitelist add/remove/list\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── PURGE ─────────────────────────────────────────────────────────────
        if (command === 'purge') {
            const count = Math.min(1000, Math.max(1, parseInt(args[0]) || 10));
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Purging ${count} messages...\u001b[0m\n\`\`\``).catch(() => {});
            try {
                // Collect enough messages — fetch up to 100 at a time scrolling back
                let collected: any[] = [];
                let before: string | undefined;
                while (collected.length < count) {
                    const batch: any = await message.channel.messages
                        .fetch({ limit: 100, ...(before ? { before } : {}) })
                        .catch(() => null);
                    if (!batch || batch.size === 0) break;
                    const mine = [...batch.values()].filter(
                        (m: any) => m.author.id === client.user?.id
                    );
                    collected.push(...mine);
                    before = [...batch.values()].pop()?.id;
                    if (batch.size < 100) break;
                }
                const toDelete = collected.slice(0, count);

                // Delete in small concurrent batches to maximise speed without
                // hitting per-route rate limits (Discord allows ~1 delete/s for users)
                let deleted = 0;
                const BATCH = 3;
                for (let i = 0; i < toDelete.length; i += BATCH) {
                    const chunk = toDelete.slice(i, i + BATCH);
                    const results = await Promise.allSettled(
                        chunk.map((m: any) => m.delete())
                    );
                    deleted += results.filter(r => r.status === 'fulfilled').length;
                    // Respect rate limit: ~300ms between batches of 3 ≈ 10 deletes/s
                    if (i + BATCH < toDelete.length) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
                await message.channel.send(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Purged ${deleted} message(s).\u001b[0m\n\`\`\``
                ).catch(() => {});
            } catch {
                await message.channel.send(
                    `\`\`\`ansi\n\u001b[1;31m[!] Purge failed.\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── CLOSEALLDMS ────────────────────────────────────────────────────────
        if (command === 'closealldms') {
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Closing all DM channels...\u001b[0m\n\`\`\``).catch(() => {});
            // type 'DM' (1) = private DMs only — GROUP_DM (3) excluded intentionally
            const dmChannels = client.channels.cache.filter(
                (c: any) => c.type === 'DM' || c.type === 1
            );
            const toClose = [...dmChannels.values()];
            await Promise.allSettled(toClose.map((ch: any) => ch.delete().catch(() => {})));
            await message.channel.send(
                `\`\`\`ansi\n\u001b[1;32m[✓] Closed ${toClose.length} DM channel(s). GCs untouched.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── MASSDM ────────────────────────────────────────────────────────────
        if (command === 'massdm') {
            const dmContent = fullArgs.trim();
            if (!dmContent) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}massdm <message>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            // Type 1 = friend in discord.js-selfbot-v13 relationships cache
            const relationshipCache: Map<string, number> = (client as any).relationships?.cache ?? new Map();
            const friendIds: string[] = [];
            for (const [userId, type] of relationshipCache.entries()) {
                if (type === 1) friendIds.push(userId);
            }

            if (friendIds.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No friends found on this account.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            await message.edit(
                `\`\`\`ansi\n\u001b[1;33m[~] Blasting DMs to ${friendIds.length} friend(s)...\u001b[0m\n\`\`\``
            ).catch(() => {});

            let sent = 0, failed = 0;
            const BATCH = 5;

            for (let i = 0; i < friendIds.length; i += BATCH) {
                const batch = friendIds.slice(i, i + BATCH);
                const results = await Promise.allSettled(
                    batch.map(async (userId) => {
                        const user = await client.users.fetch(userId).catch(() => null);
                        if (!user) throw new Error('fetch_failed');
                        // Only send to private DMs — skip bots / GC-only users
                        const dm = await user.createDM().catch(() => null);
                        if (!dm) throw new Error('dm_open_failed');
                        await dm.send(dmContent);
                    })
                );
                for (const r of results) {
                    if (r.status === 'fulfilled') sent++;
                    else failed++;
                }
                // brief pause between batches to stay under rate limits
                if (i + BATCH < friendIds.length) {
                    await new Promise(r => setTimeout(r, 400));
                }
            }

            await message.channel.send(
                `\`\`\`ansi\n\u001b[1;32m[✓] Mass DM complete.\u001b[0m\n` +
                `\u001b[1;33mSent:\u001b[0m   ${sent}\n` +
                `\u001b[1;31mFailed:\u001b[0m ${failed}\n` +
                `\u001b[1;30mTotal: ${friendIds.length} friends — GCs excluded\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── STOPALL ────────────────────────────────────────────────────────────
        if (command === 'stopall') {
            // Stop bully
            const bi = bullyIntervals.get(configId);
            if (bi) { clearInterval(bi.interval); bullyIntervals.delete(configId); }
            // Stop spam
            activeSpams.set(configId, false);
            // Stop autoreact
            autoReactConfigs.delete(configId);
            // Stop trap
            trappedUsers.delete(configId);
            // Stop mock
            mockTargets.delete(configId);
            // Stop status mover
            const smi = statusMoverIntervals.get(configId);
            if (smi) {
                clearInterval(smi);
                statusMoverIntervals.delete(configId);
                try { client.user.setPresence({ status: 'online', afk: false, activities: [] }); } catch (_) {}
            }
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] All automations stopped.\u001b[0m\n` +
                `\u001b[1;30mBully · Spam · AutoReact · Trap · Mock · StatusMover\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── MOCK ──────────────────────────────────────────────────────────────
        if (command === 'mock') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                mockTargets.delete(configId);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Mock mode stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            if (!userId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}mock <@user> | ${prefix}mock stop\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            mockTargets.set(configId, userId);
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Now mocking <@${userId}>.\u001b[0m\n` +
                `\u001b[1;30mEvery message they send will be echoed in mocking case.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── PREFIX ────────────────────────────────────────────────────────────
        if (command === 'prefix') {
            const sub = args[0]?.toLowerCase();
            const newPrefix = args[1];
            if (sub === 'set' && newPrefix) {
                await storage.updateBot(configId, { commandPrefix: newPrefix });
                clientConfigs.set(configId, { ...config, commandPrefix: newPrefix });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Prefix updated to: ${newPrefix}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}prefix set <new_prefix>\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── REPORT SERVER ─────────────────────────────────────────────────────
        if (command === 'report') {
            const sub = args[0]?.toLowerCase();
            const guildId = args[1];
            if (sub === 'server' && guildId) {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;33m[~] Reporting server ${guildId} — fetching report menu...\u001b[0m\n\`\`\``
                ).catch(() => {});

                const token = (client as any).token;
                const reportHeaders: Record<string, string> = {
                    'Authorization': token,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'X-Discord-Locale': 'en-US',
                    'X-Discord-Timezone': 'America/New_York',
                };

                // ── Step 1: fetch guild report menu to get correct node IDs ──
                let breadcrumbs: number[] = [];
                let menuVariant = '3';

                try {
                    const menuRes = await fetch('https://discord.com/api/v9/reporting/menu/guild', {
                        headers: reportHeaders,
                    });
                    if (menuRes.ok) {
                        const menu = await menuRes.json() as any;
                        menuVariant = String(menu.variant || '3');
                        const nodes: Record<number, any> = menu.nodes || {};
                        const rootId: number = menu.root_node_id;

                        // Walk the node tree, preferring harassment/bullying children
                        const walkToHarassment = (): number[] => {
                            const path: number[] = [];
                            let currentId: number = rootId;
                            for (let depth = 0; depth < 15; depth++) {
                                const node = nodes[currentId];
                                if (!node) break;
                                path.push(currentId);
                                if (node.button?.type === 'submit' || node.is_auto_submit) break;
                                const children: Array<{ name: string; target_node_id: number }> =
                                    node.children || [];
                                if (children.length === 0) break;
                                // Prefer harassment / bullying option
                                const targeted = children.find((c) => {
                                    const n = (c.name || '').toLowerCase();
                                    return (
                                        n.includes('harass') ||
                                        n.includes('bully') ||
                                        n.includes('abuse') ||
                                        n.includes('threat')
                                    );
                                });
                                currentId = targeted
                                    ? targeted.target_node_id
                                    : children[0].target_node_id;
                            }
                            return path;
                        };

                        breadcrumbs = walkToHarassment();
                    }
                } catch { /* menu fetch failed — will fallback below */ }

                await message.edit(
                    `\`\`\`ansi\n\u001b[1;33m[~] Sending 20 reports for server ${guildId}...\u001b[0m\n\`\`\``
                ).catch(() => {});

                // ── Step 2: send 20 reports ──────────────────────────────────
                let success = 0;
                let failed = 0;

                for (let i = 0; i < 20; i++) {
                    let sent = false;

                    // Try V3 (in-app reports) first — most effective
                    if (breadcrumbs.length > 0) {
                        try {
                            const v3Res = await fetch('https://discord.com/api/v9/reporting/guild', {
                                method: 'POST',
                                headers: reportHeaders,
                                body: JSON.stringify({
                                    version: '1.0',
                                    variant: menuVariant,
                                    name: 'guild',
                                    language: 'en',
                                    breadcrumbs,
                                    guild_id: guildId,
                                }),
                            });
                            if (v3Res.status === 201 || v3Res.ok) {
                                success++;
                                sent = true;
                            }
                        } catch { /* fall through to V1 */ }
                    }

                    // Fallback: V1 report with reason 2 (Harassment)
                    if (!sent) {
                        try {
                            const v1Res = await fetch('https://discord.com/api/v9/report', {
                                method: 'POST',
                                headers: reportHeaders,
                                body: JSON.stringify({
                                    guild_id: guildId,
                                    channel_id: null,
                                    message_id: null,
                                    reason: 2,
                                }),
                            });
                            if (v1Res.ok || v1Res.status === 201 || v1Res.status === 204) {
                                success++;
                            } else {
                                failed++;
                            }
                        } catch {
                            failed++;
                        }
                    }

                    await new Promise(r => setTimeout(r, 600));
                }

                const failNote = failed > 0 ? `\n\u001b[1;31m[!] ${failed} failed (rate-limited or invalid ID).\u001b[0m` : '';
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Done. ${success}/20 reports sent for server ${guildId} (harassment & bullying).${failNote}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}report server <guild_id>\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── NITROSNIPER ───────────────────────────────────────────────────────
        if (command === 'nitrosniper') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'on' || sub === 'off') {
                const enable = sub === 'on';
                await storage.updateBot(configId, { nitroSniper: enable });
                clientConfigs.set(configId, { ...config, nitroSniper: enable });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Nitro Sniper: ${enable ? 'ON' : 'OFF'}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}nitrosniper on/off\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── SERVER EMOJI STEAL ───────────────────────────────────────────────
        if (command === 'server' && args[0]?.toLowerCase() === 'emoji' && args[1]?.toLowerCase() === 'steal') {
            const sourceGuildId = args[2];
            if (!sourceGuildId) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}server emoji steal <guild_id>\u001b[0m\n\`\`\``).catch(() => {});
            }
            if (!message.guild) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] This command can only be used inside a server.\u001b[0m\n\`\`\``).catch(() => {});
            }
            const targetGuild = message.guild;

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Fetching emojis from guild ${sourceGuildId}...\u001b[0m\n\`\`\``).catch(() => {});

            let sourceGuild: any;
            try {
                sourceGuild = await client.guilds.fetch(sourceGuildId);
            } catch {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not fetch guild ${sourceGuildId}. Make sure the bot is in that server.\u001b[0m\n\`\`\``).catch(() => {});
            }

            // Fetch full emoji list from the source guild
            let emojis: any[];
            try {
                const fetched = await sourceGuild.emojis.fetch();
                emojis = Array.from(fetched.values());
            } catch {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch emojis from guild ${sourceGuildId}.\u001b[0m\n\`\`\``).catch(() => {});
            }

            if (emojis.length === 0) {
                return message.edit(`\`\`\`ansi\n\u001b[1;33m[!] That guild has no custom emojis.\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Stealing ${emojis.length} emoji(s) from ${sourceGuild.name}...\u001b[0m\n\`\`\``).catch(() => {});

            let uploaded = 0;
            let failed = 0;
            const failedNames: string[] = [];

            for (const emoji of emojis) {
                try {
                    const url = emoji.url || `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
                    await targetGuild.emojis.create(url, emoji.name);
                    uploaded++;
                    // Small delay to avoid rate limits
                    await new Promise(r => setTimeout(r, 500));
                } catch (e: any) {
                    failed++;
                    failedNames.push(emoji.name);
                    // If we hit the emoji limit, stop early
                    if (e?.message?.toLowerCase().includes('maximum') || e?.code === 30008) {
                        await message.edit(
                            `\`\`\`ansi\n\u001b[1;33m[!] Emoji limit reached in this server.\n` +
                            `\u001b[1;32m[✓] Uploaded: ${uploaded}  \u001b[1;31mFailed: ${failed}\u001b[0m\n\`\`\``
                        ).catch(() => {});
                        return;
                    }
                }
            }

            const DIM = '\u001b[1;30m';
            const GRN = '\u001b[1;32m';
            const RED = '\u001b[1;31m';
            const CYN = '\u001b[1;36m';
            const RST = '\u001b[0m';
            const BAR = '─'.repeat(44);

            let result = `\`\`\`ansi\n${CYN}[NETRUNNER] EMOJI STEAL COMPLETE${RST}\n`;
            result += `${DIM}${BAR}${RST}\n`;
            result += `${'\u001b[1;33m'}Source:${RST}   ${sourceGuild.name} (${sourceGuildId})\n`;
            result += `${'\u001b[1;33m'}Target:${RST}   ${targetGuild.name}\n`;
            result += `${DIM}${BAR}${RST}\n`;
            result += `${GRN}Uploaded: ${uploaded}${RST}   ${RED}Failed: ${failed}${RST}\n`;
            if (failedNames.length > 0) {
                result += `${DIM}Failed: ${failedNames.slice(0, 10).join(', ')}${failedNames.length > 10 ? ` +${failedNames.length - 10} more` : ''}${RST}\n`;
            }
            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

      });

      const LOGIN_TIMEOUT_MS = 20000;
      await Promise.race([
        client.login(initialConfig.token),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), LOGIN_TIMEOUT_MS)
        ),
      ]);
      activeClients.set(configId, client);
      return { success: true };
    } catch (e: any) {
      console.error(`Failed to start bot ${initialConfig.name}:`, e);
      // Clean up any partial state
      try { activeClients.get(configId)?.destroy(); } catch {}
      activeClients.delete(configId);
      clientConfigs.delete(configId);
      await storage.updateBot(configId, { isRunning: false }).catch(() => {});
      const msg = e?.message || String(e);
      let friendly: string;
      if (msg.includes('TOKEN_INVALID') || msg.toLowerCase().includes('invalid token')) {
        friendly = 'Invalid Discord token — double-check and try again.';
      } else if (msg.includes('LOGIN_TIMEOUT')) {
        friendly = 'Connection timed out — Discord did not respond in time. Check if the token is correct and try again.';
      } else if (msg.toLowerCase().includes('disallowed intents') || msg.includes('4014')) {
        friendly = 'Privileged intents are not enabled for this token.';
      } else if (msg.toLowerCase().includes('rate limit') || msg.includes('429')) {
        friendly = 'Rate limited by Discord — please wait a moment and try again.';
      } else {
        friendly = `Failed to connect: ${msg}`;
      }
      return { success: false, error: friendly };
    }
  }

  private static clearRpcInterval(botId: number) {
    const existing = rpcIntervals.get(botId);
    if (existing) {
        clearInterval(existing);
        rpcIntervals.delete(botId);
    }
  }

  private static applyRpc(client: Client, config: BotConfig) {
    if (!client.user) return;

    this.clearRpcInterval(config.id);

    const details = config.rpcTitle?.trim();
    const state = config.rpcSubtitle?.trim();
    const appName = config.rpcAppName?.trim();
    const hasRpc = appName || (details && details.length >= 2) || (state && state.length >= 2);

    if (!hasRpc) {
        try {
            client.user.setPresence({ status: 'online', afk: false, activities: [] });
        } catch (_) {}
        return;
    }

    const typeMap: Record<string, number> = {
        PLAYING: 0,
        STREAMING: 1,
        LISTENING: 2,
        WATCHING: 3,
        COMPETING: 5,
    };
    const rpcTypeStr = (config.rpcType?.toUpperCase() || "PLAYING");
    const rpcTypeNum = typeMap[rpcTypeStr] ?? 0;

    // ── Progress bar / seek bar ────────────────────────────────────────────
    // Values stored are seconds (start = elapsed position, end = total duration).
    // We compute fixed absolute Unix ms timestamps ONCE so Discord's client
    // naturally advances the seek bar in real time without us having to touch it.
    const rawStart = config.rpcStartTimestamp?.trim();
    const rawEnd   = config.rpcEndTimestamp?.trim();
    const startSec = rawStart ? parseFloat(rawStart) : 0;
    const endSec   = rawEnd   ? parseFloat(rawEnd)   : 0;

    let fixedTimestamps: { start: number; end?: number } | null = null;
    if (endSec > 0) {
        const now = Date.now();
        // absoluteStart = when the track "began" based on elapsed position
        const absoluteStart = Math.floor(now - startSec * 1000);
        // absoluteEnd   = when the track will finish
        const absoluteEnd   = absoluteStart + Math.floor(endSec * 1000);
        fixedTimestamps = { start: absoluteStart, end: absoluteEnd };
        console.log(`[RPC] Seek bar for ${client.user.tag}: ${startSec}s / ${endSec}s → start=${absoluteStart} end=${absoluteEnd}`);
    } else if (startSec > 0) {
        // Only a start was given → show elapsed timer (no total / no bar)
        const absoluteStart = Math.floor(Date.now() - startSec * 1000);
        fixedTimestamps = { start: absoluteStart };
    }

    // Build a RichPresence using the class (needed for correct image/asset handling)
    const buildRpc = () => {
        const rpc = new RichPresence(client)
            .setName(appName || "discord")
            .setType(rpcTypeNum);

        // Streaming requires a URL
        if (rpcTypeNum === 1) {
            try { rpc.setURL("https://www.twitch.tv/discord"); } catch (_) {}
        }

        if (details && details.length >= 2) rpc.setDetails(details);
        if (state   && state.length   >= 2) rpc.setState(state);

        if (fixedTimestamps) {
            if (fixedTimestamps.start) rpc.setStartTimestamp(fixedTimestamps.start);
            if (fixedTimestamps.end)   rpc.setEndTimestamp(fixedTimestamps.end);
        }

        if (config.rpcImage) {
            rpc.setAssetsLargeImage(config.rpcImage);
            if (details) rpc.setAssetsLargeText(details);
        }

        return rpc;
    };

    console.log(`[RPC] Applying for ${client.user.tag}: name="${appName}" type=${rpcTypeNum} details="${details}" state="${state}" image="${config.rpcImage}"`);

    const applyPresence = () => {
        if (!client.user) return;
        try {
            const rpc = buildRpc();
            client.user.setPresence({
                status: 'online',
                afk: false,
                activities: [rpc],
            });
        } catch (e) {
            console.error(`[RPC] Failed to set activity for ${client.user?.tag}:`, e);
        }
    };

    applyPresence();

    const interval = setInterval(applyPresence, 30000);
    rpcIntervals.set(config.id, interval);
  }

  static async stopBot(id: number) {
    this.clearRpcInterval(id);
    const smi = statusMoverIntervals.get(id);
    if (smi) { clearInterval(smi); statusMoverIntervals.delete(id); }
    const vcConn = voiceConnections.get(id);
    if (vcConn) {
      try { vcConn.disconnect(); } catch {}
      voiceConnections.delete(id);
    }
    const client = activeClients.get(id);
    if (client) {
      client.destroy();
      activeClients.delete(id);
      clientConfigs.delete(id);
      botStartTimes.delete(id);
    }
    await storage.updateBot(id, { isRunning: false, lastSeen: new Date().toISOString() });
  }

  static async restartBot(id: number) {
    const bot = await storage.getBot(id);
    await this.stopBot(id);
    if (bot) {
      await this.startBot(bot);
    }
  }

  static async updateBotConfig(id: number, updates: any) {
    const updated = await storage.updateBot(id, updates);
    if (!updated) return;
    clientConfigs.set(id, updated);

    const isCurrentlyRunning = activeClients.has(id);
    const wantsRunning = updates.isRunning;

    if (wantsRunning === true && !isCurrentlyRunning) {
      console.log(`[manager] Starting bot ${id} due to isRunning=true`);
      this.startBot(updated).catch(e => console.error(`[manager] Failed to start bot ${id}:`, e));
    } else if (wantsRunning === false && isCurrentlyRunning) {
      console.log(`[manager] Stopping bot ${id} due to isRunning=false`);
      this.stopBot(id).catch(e => console.error(`[manager] Failed to stop bot ${id}:`, e));
    } else {
      const client = activeClients.get(id);
      if (client) {
        console.log(`[manager] Config updated for bot ${id}, re-applying RPC...`);
        this.applyRpc(client, updated);
      }
    }
  }
}
