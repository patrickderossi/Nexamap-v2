// IntraMaps (T1 Cloud) adapter — WA shire planning data, headless + anonymous.
//
// Turns the reverse-engineered protocol (see PROTOCOL.md) into a clean call:
//   const im = new IntraMaps("stirling");
//   const planning = await im.getPlanning("29 Weaponess Road, Scarborough");
//   -> { scheme, zone, rCode, propertyNumber, ward, overlays, fields, links }
//
// CLI:
//   node intramaps.mjs --council stirling --address "29 Weaponess Road Scarborough"
//   node intramaps.mjs --council stirling --address "…" --raw
//   node intramaps.mjs --list

import { getCouncil, listCouncils } from "./councils.mjs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class IntraMapsError extends Error {}

// ------------------------------- the client ----------------------------------

export class IntraMaps {
  constructor(council) {
    const c = typeof council === "string" ? getCouncil(council) : council;
    if (!c) throw new IntraMapsError(`Unknown council: ${council}`);
    this.c = c;
    this.token = null;
  }

  _url(path, params = {}) {
    const u = new URL(this.c.base + path);
    if (this.token) u.searchParams.set("IntraMapsSession", this.token);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async _req(method, url, body, { retries = 0, backoff = 3000 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method,
          signal: ctrl.signal,
          headers: {
            "User-Agent": UA,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        // Transient backend/throttle responses get a backed-off retry.
        if (!res.ok) {
          if (attempt < retries && [400, 429, 500, 502, 503, 504].includes(res.status)) {
            await sleep(backoff * (attempt + 1));
            continue;
          }
          throw new IntraMapsError(`${method} ${url} → HTTP ${res.status}`);
        }
        return res;
      } catch (e) {
        if (attempt < retries && e.name === "AbortError") {
          await sleep(backoff * (attempt + 1));
          continue;
        }
        throw e;
      } finally {
        clearTimeout(t);
      }
    }
  }

  // 1+2. Anonymous session, then open the public project.
  // configId is required on T1 Cloud; self-hosted IntraMaps (intramaps90/97/23A)
  // serves a single config per instance, so it's omitted there.
  async start() {
    const sessUrl = this.c.configId
      ? `${this.c.base}/Projects/?configId=${this.c.configId}`
      : `${this.c.base}/Projects/`;
    const res = await this._req("GET", sessUrl);
    // T1 Cloud + newer self-hosted issue the session as a response header. Older
    // self-hosted (e.g. intramaps21b) expect the *client* to mint the session
    // GUID and pass it as ?IntraMapsSession= — the server registers it on first use.
    this.token = res.headers.get("x-intramaps-session") || randomUUID();
    const openParams = { appType: "Standard", project: this.c.project, datasetCode: "" };
    if (this.c.configId) openParams.configId = this.c.configId;
    const open = await this._req("POST", this._url("/Projects/", openParams), {});
    this.openInfo = await open.json().catch(() => null); // { name, modules:[...], authorisation }
    return this;
  }

  // 3. Switch module (e.g. Planning). Returns the module config JSON.
  // Newer IntraMaps reads `module`; older self-hosted (intramaps96) reads
  // `moduleName` — send both so one adapter covers every version.
  async setModule(module) {
    const res = await this._req("POST", this._url("/Modules/"), {
      module,
      moduleName: module,
      includeBasemaps: true,
    });
    return res.json();
  }

  // 4a. Query a combo (ComboContents) → array of option strings.
  async combo(templateId, text) {
    const res = await this._req(
      "POST",
      this._url("/Search/ComboContents"),
      { templateId, queryParameter: text },
      { retries: 3 },
    );
    const data = await res.json();
    return (data.items || []).map((i) => i.key).filter(Boolean);
  }
  autocomplete(text) {
    return this.combo(this.c.addressCombo, text);
  }

  // 4b. Submit a POSITIONAL `fields` array against a form → selection response.
  async _submitSearch(formId, fields) {
    const url = this._url("/Search/", {
      infoPanelWidth: 0,
      mode: "Refresh",
      form: formId,
      resubmit: "false",
      selectionLayersFilter: "",
    });
    const res = await this._req("POST", url, { fields }, { retries: 3 });
    return res.json();
  }

  // Full flow: address → structured planning result. Handles all three form
  // shapes seen across councils — single full-address combo (Stirling),
  // Street/Number cascade (Melville), and full-text (Swan/Belmont/South Perth) —
  // and refines multi-result selections down to the best single parcel.
  async getPlanning(address) {
    await this.start();
    const mod = await this.setModule(this.c.planningModule);
    const form =
      (mod.forms || []).find((f) => f.templateId === this.c.addressForm) ||
      (mod.forms || []).find((f) => /address/i.test(f.name || "")) ||
      (mod.forms || [])[0];
    if (!form) throw new IntraMapsError("No address search form on this council");
    const controls = (form.rows || []).flatMap((r) => r.controls || []);
    const streetCtrl = controls.find((c) => /street/i.test(c.queryParameter || ""));
    const isFullText =
      /fulltext/i.test(form.subType || "") || controls.some((c) => /fulltext/i.test(c.type || ""));

    let selection, matched;

    if (isFullText) {
      // Full-text: search returns a suggestion list; pick the best, then refine it.
      let sugg = [];
      for (const q of [address, ...queryCandidates(address)]) {
        sugg = await this._fullText(form.templateId, q);
        if (sugg.length) break;
      }
      if (!sugg.length) throw new IntraMapsError(`No address match for "${address}"`);
      const best = bestMatchBy(address, sugg, (s) => s.displayValue || "");
      selection = await this._refine(best.selectionLayer, best.mapKey);
      matched = best.displayValue || address;
    } else {
      let fields;
      if (streetCtrl) {
        // Cascade form: parse the address, resolve the street against its combo.
        const p = parseAddress(address);
        let street = p.street;
        if (streetCtrl.templateId) {
          const opts = await this.combo(streetCtrl.templateId, p.street);
          if (opts.length) street = bestMatch(p.street, opts);
        }
        // Fill each control by what its queryParameter means — councils name the
        // house-number control @number, @house, @no, @streetno, etc.
        const fillCtrl = (qp) => {
          const q = (qp || "").toLowerCase().replace(/^@/, "");
          if (q.includes("unit")) return p.unit;
          if (q.includes("suffix")) return p.suffix;
          if (q === "no" || q.includes("house") || q.includes("number") || q.includes("streetno")) return p.number;
          if (q.includes("street") || q.includes("road")) return street;
          if (q.includes("suburb") || q.includes("locality")) return p.suburb;
          return "";
        };
        fields = controls.map((c) => fillCtrl(c.queryParameter));
        matched = [p.unit ? `${p.unit}/` : "", `${p.number}${p.suffix}`, street, p.suburb].join(" ").replace(/\s+/g, " ").trim();
      } else {
        // Single full-address combo: autocomplete, place the key in its slot.
        const comboCtrl = controls.find((c) => c.templateId) || controls[0];
        const comboId = this.c.addressCombo || comboCtrl?.templateId;
        let items = [];
        for (const q of queryCandidates(address)) {
          items = await this.combo(comboId, q);
          if (items.length) break;
        }
        if (!items.length) throw new IntraMapsError(`No address match for "${address}"`);
        const key = bestMatch(address, items);
        fields = controls.length ? controls.map((c) => (c.templateId === comboId ? key : "")) : [key];
        matched = key;
      }
      selection = await this._submitSearch(form.templateId, fields);
      // Older "refine" forms answer a cascade with a suggestion list (just like
      // fullText, under `refine`) rather than a selection — pick best & refine it.
      if (selection?.refine?.length) {
        const best = bestMatchBy(address, selection.refine, (s) => s.displayValue || "");
        selection = await this._refine(best.selectionLayer, best.mapKey);
        matched = best.displayValue || matched;
      } else if (selection?.infoPanels?.info1?.count > 1) {
        // Multi-result list → materialise the first match's full fields.
        selection = await this._selectByIndex(0);
      }
    }
    return parsePlanning(selection, { council: this.c.name, query: address, matchedAddress: matched });
  }

  // Full-text search → array of suggestions { mapKey, dbKey, displayValue, selectionLayer }.
  async _fullText(formId, text) {
    const url = this._url("/Search/", {
      infoPanelWidth: 0, mode: "Refresh", form: formId, resubmit: "false", selectionLayersFilter: "",
    });
    const res = await this._req("POST", url, { fields: [text] }, { retries: 3 });
    const data = await res.json();
    return data.fullText || [];
  }

  // Refine a chosen suggestion (layer + mapKey) → selection with infoPanels.
  async _refine(selectionLayer, mapKey) {
    const res = await this._req(
      "POST",
      this._url("/Search/Refine/Set"),
      { selectionLayer, mapKey: String(mapKey), infoPanelWidth: 0, mode: "Refresh" },
      { retries: 3 },
    );
    return res.json();
  }

  // Pick result N from a multi-result selection → that feature's full fields.
  async _selectByIndex(index) {
    const res = await this._req("POST", this._url(`/Selection/Set/${index}`), {}, { retries: 2 });
    return res.json();
  }
}

// ------------------------------ address matching -----------------------------

// The autocomplete matches on street, and chokes on leading house numbers.
// Produce a ladder of progressively looser queries.
function queryCandidates(address) {
  const stripped = address.replace(/^[\s\d\-/,]+/, "").trim();
  const words = stripped.split(/\s+/);
  const out = [stripped];
  if (words.length > 2) out.push(words.slice(0, 2).join(" "));
  if (words[0]) out.push(words[0]);
  return [...new Set(out.filter(Boolean))];
}

// Street-type words that mark the boundary between street name and suburb.
const STREET_TYPES =
  /^(ave|av|avenue|rd|road|st|street|ct|court|cl|close|way|pl|place|cres|crescent|dr|drive|pde|parade|hwy|highway|la|lane|ln|loop|gdns|gardens|tce|terrace|blvd|boulevard|gr|grove|gve|rise|view|views|walk|mews|green|grn|quay|esp|esplanade|cir|circle|circuit|cct|ramble|retreat|vista|bend|brace|break|chase|cnr|corner|crossing|dale|entrance|fairway|gate|glade|glen|heights|hts|key|link|outlook|pass|pathway|promenade|prom|reach|ridge|row|run|square|sq|strand|turn|vale|wood|haven|nook|cove|point|pt|approach|crest|dell|gardens|hill|junction|landing|meander|parkway|pocket|ridgeway|ring|slope|spur|track|trail|wynd)$/i;

// Parse "5/30A Canning Avenue Mount Pleasant" → {unit,number,suffix,street,suburb}
function parseAddress(a) {
  let s = (a || "").trim();
  let unit = "", number = "", suffix = "";
  let m = s.match(/^(\d+)\s*\/\s*/); // "5/30 …" → unit 5
  if (m) { unit = m[1]; s = s.slice(m[0].length); }
  m = s.match(/^unit\s+(\w+)\s+/i);
  if (m) { unit = m[1]; s = s.slice(m[0].length); }
  m = s.match(/^(\d+)([A-Za-z])?\s+/); // house number (+ optional attached suffix letter)
  if (m) { number = m[1]; suffix = m[2] || ""; s = s.slice(m[0].length); }
  const words = s.split(/[\s,]+/).filter(Boolean);
  let idx = -1;
  for (let i = 0; i < words.length; i++) if (STREET_TYPES.test(words[i])) idx = i; // last street-type word wins
  const street = idx >= 0 ? words.slice(0, idx + 1).join(" ") : words.join(" ");
  const suburb = idx >= 0 ? words.slice(idx + 1).join(" ") : "";
  return { unit, number, suffix, street, suburb };
}

// SLIP abbreviates road types (AVE/RD/HWY); IntraMaps stores them in full.
// Expand so token-overlap matching treats "CANNING AVE" === "Canning Avenue".
const ABBREV = {
  AVE: "AVENUE", AV: "AVENUE", RD: "ROAD", ST: "STREET", HWY: "HIGHWAY",
  CT: "COURT", PL: "PLACE", CRES: "CRESCENT", CR: "CRESCENT", DR: "DRIVE",
  PDE: "PARADE", LN: "LANE", CL: "CLOSE", TCE: "TERRACE", BLVD: "BOULEVARD",
  GR: "GROVE", GVE: "GROVE", SQ: "SQUARE", CCT: "CIRCUIT", CIR: "CIRCLE",
  PROM: "PROMENADE", ESP: "ESPLANADE", GDNS: "GARDENS", PT: "POINT",
  HTS: "HEIGHTS", GRN: "GREEN", WY: "WAY", PWY: "PARKWAY", RMBL: "RAMBLE",
};
const tokens = (s) =>
  ((s || "").toUpperCase().match(/[A-Z0-9]+/g) || []).map((t) => ABBREV[t] || t);

// Pick the candidate address whose tokens best overlap the user's input.
function bestMatch(address, items) {
  const want = new Set(tokens(address));
  let best = items[0];
  let bestScore = -1;
  for (const it of items) {
    const got = tokens(it);
    const score = got.filter((t) => want.has(t)).length - got.length * 0.01; // overlap, tie-break shorter
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

// Like bestMatch but for arbitrary objects, scoring on a derived string.
function bestMatchBy(address, arr, keyFn) {
  const want = new Set(tokens(address));
  let best = arr[0];
  let bestScore = -1;
  for (const it of arr) {
    const got = tokens(keyFn(it));
    const score = got.filter((t) => want.has(t)).length - got.length * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

// ------------------------------- result parsing ------------------------------

function fieldValue(f) {
  if (f.type === "Link") {
    return (f.links || []).map((l) => l?.text?.value).filter(Boolean).join(" | ");
  }
  const v = f.value;
  return v && typeof v === "object" ? v.value : v;
}
function fieldUrl(f) {
  if (f.type !== "Link") return null;
  return (f.links || []).map((l) => l?.url?.value).filter(Boolean)[0] || null;
}

function parsePlanning(selection, meta) {
  const ip = selection?.infoPanels || {};
  const panels = [];
  const fields = {};
  const links = {};

  for (const key of ["info1", "info2", "info3"]) {
    const p = ip[key];
    if (!p) continue;
    const list = (p.feature && p.feature.fields) || p.fields || [];
    const parsed = list.map((f) => ({ caption: f.caption, value: fieldValue(f), type: f.type }));
    panels.push({ panel: key, caption: p.caption, fields: parsed });
    for (const f of list) {
      if (f.caption == null) continue;
      const val = fieldValue(f);
      if (val !== "" && val != null && !(f.caption in fields)) fields[f.caption] = val;
      const url = fieldUrl(f);
      if (url) links[f.caption] = url;
    }
  }

  const pick = (...captions) => captions.map((c) => fields[c]).find((v) => v != null && v !== "");
  // Keyword caption resolver — councils name fields wildly differently
  // ("LPS 7 Zone", "R Code (DOP)", "MRS Zoning", "Land Area" …). Match by keyword.
  const findVal = (re, exclude) => {
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === "") continue;
      const sv = String(v).trim();
      // Skip yes/no flag values and "header" fields (value === caption, e.g. ZONING=ZONING).
      if (/^(yes|no|n\/a|none|not applicable|true|false|click here|-)$/i.test(sv)) continue;
      if (sv.toLowerCase() === k.trim().toLowerCase()) continue;
      if (re.test(k) && !(exclude && exclude.test(k))) return v;
    }
    return null;
  };
  // Local-scheme zone preferred, then generic "zone", then an LPS/DPS-numbered
  // field (e.g. Belmont's "LPS15 (DOP)"), then the MRS zone.
  const zone =
    findVal(/(?:lps|tps|dps|scheme|local)\s*\d*\s*zon(?:e|ing)\b/i, /metropolitan|region\s*scheme|\bmrs\b/i) ??
    findVal(/\bzon(?:e|ing)\b/i, /metropolitan|region\s*scheme|\bmrs\b|reserve\s*$/i) ??
    findVal(/\b(?:lps|tps|dps)\s*\d+\b/i, /scheme|r[\s-]?code|reserve|amendment|policy|strategy|special|heritage|sca\b/i) ??
    findVal(/metropolitan\s*region|region\s*scheme|\bmrs\b/i);
  const rField = findVal(/r[\s-]?codes?\b/i);
  const rMatch = rField ? String(rField).match(/R\d+(?:\.\d+)?(?:-\w+)?/i) : zone && String(zone).match(/R\d+(?:\.\d+)?(?:-\w+)?/i);

  // Overlay fields = the moat. Flag any field (in any panel) whose caption looks
  // like a planning overlay AND has a meaningful (non-"No"/empty) value.
  const OVERLAY_RE = /precinct|development\s*plan|structure\s*plan|\blsp\b|special\s*control|special\s*provision|special\s*character|additional\s*use|\bldp\b|\bdcp\b|overlay|restricted\s*use|heritage|bushfire|flood|contamin/i;
  const overlays = panels
    .flatMap((p) => p.fields)
    .filter((f) => f.caption && OVERLAY_RE.test(f.caption))
    .filter((f) => f.value != null && f.value !== "" && !/^(no|n\/a|none|not applicable)$/i.test(String(f.value).trim()))
    .map((f) => ({ caption: f.caption, value: f.value }));

  return {
    council: meta.council,
    query: meta.query,
    matchedAddress: meta.matchedAddress,
    scheme: pick("Scheme", "Local Planning Scheme", "LPS"),
    zone,
    rCode: rMatch ? rMatch[0].toUpperCase() : rField || null,
    area:
      findVal(/(legal|land|lot|site|property)\s*area/i) ??
      findVal(/\barea\b/i, /airport|referral|height|control\s*area|river\s*development/i),
    lotPlan:
      pick("Description", "Lot/Plan", "Lot Plan", "Legal Description") ??
      findVal(/legal\s*desc|lot\s*\/?\s*plan|parcel\s*desc/i),
    title: pick("Vol/Folio", "Volume/Folio", "Certificate of Title", "Title") ?? findVal(/vol.*folio|certificate\s*of\s*title/i),
    propertyNumber: pick("Property Number", "Property Key", "PIN") ?? findVal(/property\s*(no|number|key)|\bpin\b/i),
    ward: pick("Ward Name", "Ward") ?? findVal(/^ward\b/i),
    overlays,
    fields,
    links,
    panels,
    warnings: selection?.header?.warnings || [],
  };
}

// ---------------------------------- CLI --------------------------------------

function parseArgs(argv) {
  const a = { council: null, address: null, raw: false, list: false };
  for (let i = 2; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--list") a.list = true;
    else if (x === "--raw") a.raw = true;
    else if (x === "--council") a.council = argv[++i];
    else if (x === "--address") a.address = argv[++i];
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv);
  if (a.list) {
    for (const c of listCouncils()) console.log(`  ${c.slug.padEnd(14)} ${c.name}`);
    return;
  }
  if (!a.council || !a.address) {
    console.log('Usage: node intramaps.mjs --council <slug> --address "<address>" [--raw]');
    console.log("       node intramaps.mjs --list");
    return;
  }
  const im = new IntraMaps(a.council);
  const result = await im.getPlanning(a.address);
  if (a.raw) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const row = (label, val) => console.log(`  ${label.padEnd(16)} ${val ?? "—"}`);
  console.log(`\n${result.council} — ${result.matchedAddress}`);
  console.log("─".repeat(60));
  row("Scheme:", result.scheme);
  row("Zone:", `${result.zone ?? "—"}  (${result.rCode ?? "?"})`);
  row("Area:", result.area);
  row("Lot / Plan:", result.lotPlan);
  row("Title:", result.title);
  row("Property No:", result.propertyNumber);
  row("Ward:", result.ward);
  if (result.overlays.length) {
    console.log(`\n  Overlays (LDP / structure plan / special control / hazards):`);
    for (const o of result.overlays) console.log(`    • ${o.caption}: ${o.value}`);
  } else {
    console.log(`\n  Overlays: none flagged on this parcel`);
  }
  if (result.warnings.length) console.log(`\n  ⚠ warnings: ${result.warnings.join("; ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
}
