// CEAC China NIV helper for Scriptable on iOS.
// Native Scriptable UI: widget + UITable + Alert. No WebView is presented.

const CEAC_URL = "https://ceac.state.gov/CEACStatTracker/Status.aspx";
const STORE_KEY = "ceac.china.lastResult.v2";
const PROFILE_KEY = "ceac.china.profile.v1";
const LEGACY_STORE_KEYS = ["ceac.beijing.lastResult.v2"];
const LEGACY_PROFILE_KEYS = ["ceac.beijing.profile.v1"];

const CHINA_POSTS = [
  { value: "BEJ", label: "Beijing", display: "CHINA, BEIJING" },
  { value: "CHD", label: "Chengdu", display: "CHINA, CHENGDU" },
  { value: "GUZ", label: "Guangzhou", display: "CHINA, GUANGZHOU" },
  { value: "SHG", label: "Shanghai", display: "CHINA, SHANGHAI" },
  { value: "SHN", label: "Shenyang", display: "CHINA, SHENYANG" },
  { value: "WUH", label: "Wuhan", display: "CHINA, WUHAN" },
];
const DEFAULT_POST = CHINA_POSTS[0];

const BASE_DATA = {
  type: "NIV",
  location: DEFAULT_POST.value,
};

let DATA = {
  ...BASE_DATA,
  applicationId: "",
  passport: "",
  surname: "",
};

const FIELD = {
  type: "ctl00$ContentPlaceHolder1$Visa_Application_Type",
  location: "ctl00$ContentPlaceHolder1$Location_Dropdown",
  caseNumber: "ctl00$ContentPlaceHolder1$Visa_Case_Number",
  passport: "ctl00$ContentPlaceHolder1$Passport_Number",
  surname: "ctl00$ContentPlaceHolder1$Surname",
  captcha: "ctl00$ContentPlaceHolder1$Captcha",
  submit: "ctl00$ContentPlaceHolder1$btnSubmit",
};

const RESULT_IDS = {
  appName: "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lblAppName",
  status: "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lblStatus",
  caseNumber: "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lblCaseNo",
  caseCreated: "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lblSubmitDate",
  caseLastUpdated: "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lblStatusDate",
  message: [
    "ctl00_ContentPlaceHolder1_ucApplicationStatusView_postMessage",
    "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lblMessage",
  ],
  contactText: "ctl00_ContentPlaceHolder1_ucApplicationStatusView_lnkContactUrl",
};

const STATUS_STYLES = {
  good: { color: "#16a34a", gradient: ["#064e3b", "#16a34a", "#86efac"] },
  refused: { color: "#b42318", gradient: ["#351417", "#8b1e20", "#c83b32"] },
  administrative: { color: "#f59e0b", gradient: ["#422006", "#d97706", "#fbbf24"] },
  hopeful: { color: "#0284c7", gradient: ["#083344", "#0284c7", "#67e8f9"] },
  neutral: { color: "#64748b", gradient: ["#1f2937", "#64748b", "#cbd5e1"] },
  error: { color: "#f97316", gradient: ["#431407", "#f97316", "#fdba74"] },
  default: { color: "#0d9488", gradient: ["#0f2538", "#0d9488", "#5eead4"] },
};

const POSTBACK_TARGET = FIELD.type;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

let cookies = {};

function postForLocation(value) {
  const text = String(value || "").trim().toUpperCase();
  return (
    CHINA_POSTS.find(
      (post) => post.value === text || post.label.toUpperCase() === text || post.display === text
    ) || DEFAULT_POST
  );
}

function isSupportedLocation(value) {
  const text = String(value || "").trim().toUpperCase();
  return CHINA_POSTS.some(
    (post) => post.value === text || post.label.toUpperCase() === text || post.display === text
  );
}

function locationLabel(value = DATA.location) {
  return postForLocation(value).label;
}

function visaSubtitle() {
  return `${DATA.type} · ${locationLabel()}`;
}

function appTitle() {
  return `CEAC ${locationLabel()}`;
}

function normalizeProfile(profile = {}) {
  return {
    ...BASE_DATA,
    location: postForLocation(profile.location).value,
    applicationId: String(profile.applicationId || "").trim().toUpperCase(),
    passport: String(profile.passport || "").trim().toUpperCase(),
    surname: String(profile.surname || "").trim().toUpperCase(),
  };
}

function hasProfile(profile) {
  return Boolean(
    profile &&
      isSupportedLocation(profile.location) &&
      profile.applicationId &&
      profile.passport &&
      profile.surname
  );
}

function readKeychainJSON(keys) {
  for (const key of keys) {
    try {
      if (Keychain.contains(key)) return JSON.parse(Keychain.get(key));
    } catch (_) {}
  }
  return null;
}

function readRawProfile() {
  return readKeychainJSON([PROFILE_KEY, ...LEGACY_PROFILE_KEYS]);
}

function readProfile() {
  try {
    const raw = readRawProfile();
    if (!raw) return null;
    const profile = normalizeProfile(raw);
    return hasProfile(profile) ? profile : null;
  } catch (_) {
    return null;
  }
}

function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  if (!hasProfile(normalized)) throw new Error("Missing CEAC profile fields.");
  clearStoredResult();
  Keychain.set(PROFILE_KEY, JSON.stringify(normalized));
  DATA = normalized;
  return normalized;
}

function removeKeychainValues(keys) {
  for (const key of keys) {
    try {
      if (Keychain.contains(key)) Keychain.remove(key);
    } catch (_) {}
  }
}

function clearStoredResult() {
  removeKeychainValues([STORE_KEY, ...LEGACY_STORE_KEYS]);
}

function clearProfile() {
  removeKeychainValues([PROFILE_KEY, ...LEGACY_PROFILE_KEYS]);
  clearStoredResult();
  DATA = { ...BASE_DATA, applicationId: "", passport: "", surname: "" };
}

async function promptLocation(currentLocation = BASE_DATA.location) {
  const current = postForLocation(currentLocation);
  const posts = [
    current,
    ...CHINA_POSTS.filter((post) => post.value !== current.value),
  ];
  const alert = new Alert();
  alert.title = "CEAC Location";
  alert.message = "China locations currently supported.";
  for (const post of posts) alert.addAction(post.label);
  alert.addCancelAction("Cancel");
  const idx = await alert.presentAlert();
  if (idx < 0) return "";
  return posts[idx].value;
}

async function promptProfile(existing = {}, selectedLocation = "") {
  const current = normalizeProfile(existing);
  const location = selectedLocation || (await promptLocation(current.location));
  if (!location) return null;
  const alert = new Alert();
  alert.title = "CEAC Profile";
  alert.message = `${postForLocation(location).display}\nStored locally in Scriptable Keychain.`;
  alert.addTextField("Application ID", current.applicationId);
  alert.addTextField("Passport", current.passport);
  alert.addTextField("Surname", current.surname);
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  const idx = await alert.presentAlert();
  if (idx < 0) return null;
  return saveProfile({
    location,
    applicationId: alert.textFieldValue(0),
    passport: alert.textFieldValue(1),
    surname: alert.textFieldValue(2),
  });
}

async function changeLocation() {
  const profile = readProfile();
  if (!profile) return promptProfile();
  const location = await promptLocation(profile.location);
  if (!location) return null;
  return saveProfile({ ...profile, location });
}

async function resetProfile() {
  const alert = new Alert();
  alert.title = "Reset profile";
  alert.message = "Remove saved location, Application ID, passport, surname, and cached result from Scriptable Keychain.";
  alert.addAction("Reset");
  alert.addCancelAction("Cancel");
  const idx = await alert.presentAlert();
  if (idx < 0) return false;
  clearProfile();
  return true;
}

async function ensureProfile() {
  const raw = readRawProfile();
  if (raw) {
    const stored = normalizeProfile(raw);
    if (hasProfile(stored)) {
      DATA = stored;
      if (!raw.location || !isSupportedLocation(raw.location)) {
        const location = await promptLocation(stored.location);
        if (!location) throw new Error("CEAC location is not configured.");
        return saveProfile({ ...stored, location });
      }
      return stored;
    }
  }
  const profile = await promptProfile();
  if (!profile) throw new Error("CEAC profile is not configured.");
  return profile;
}

function maskTail(value, visible = 4, label = "") {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return label ? `${label} not set` : "Not set";
  const tail = text.slice(-visible);
  return `${label ? `${label} ` : ""}${"•".repeat(visible)}${tail}`;
}

function maskApplication(value) {
  return maskTail(value, 4, "Case");
}

function maskPassport(value) {
  return maskTail(value, 3, "Pass");
}

function displayCaseNumber(value = "") {
  return maskApplication(value || DATA.applicationId);
}

function sanitizeResult(result = {}) {
  return {
    ...result,
    caseNumber: displayCaseNumber(result.caseNumber),
  };
}

function readStoredResult() {
  try {
    const raw = readKeychainJSON([STORE_KEY, ...LEGACY_STORE_KEYS]);
    if (!raw) return null;
    const sanitized = sanitizeResult(raw);
    const rawString = JSON.stringify(raw);
    const sanitizedString = JSON.stringify(sanitized);
    if (rawString !== sanitizedString) Keychain.set(STORE_KEY, sanitizedString);
    return sanitized;
  } catch (_) {
    return null;
  }
}

function saveStoredResult(result) {
  Keychain.set(
    STORE_KEY,
    JSON.stringify({
      ...sanitizeResult(result),
      updatedAt: new Date().toISOString(),
    })
  );
}

function formatTime(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function cookieHeader() {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function mergeCookies(response) {
  const list = (response && response.cookies) || [];
  for (const cookie of list) {
    if (cookie && cookie.name) cookies[cookie.name] = cookie.value || "";
  }
}

function baseHeaders(extra = {}) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: CEAC_URL,
    ...extra,
  };
  const ch = cookieHeader();
  if (ch) headers.Cookie = ch;
  return headers;
}

async function loadString(url, method = "GET", body = null, extraHeaders = {}) {
  const req = new Request(url);
  req.method = method;
  req.headers = baseHeaders(extraHeaders);
  req.timeoutInterval = 45;
  if (body != null) req.body = body;
  const text = await req.loadString();
  mergeCookies(req.response);
  return { text, response: req.response };
}

async function loadImage(url) {
  const req = new Request(url);
  req.method = "GET";
  req.headers = baseHeaders({
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  });
  req.timeoutInterval = 45;
  const img = await req.loadImage();
  mergeCookies(req.response);
  return img;
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = String(tag).match(re);
  return m ? htmlDecode(m[1] || m[2] || m[3] || "") : "";
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return htmlDecode(stripTags(value)).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseInputs(html) {
  const form = {};
  const inputTags = String(html).match(/<input\b[^>]*>/gi) || [];
  for (const tag of inputTags) {
    const name = attr(tag, "name");
    if (!name) continue;
    form[name] = attr(tag, "value");
  }
  return form;
}

function absoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return "https://ceac.state.gov" + url;
  return "https://ceac.state.gov/CEACStatTracker/" + url.replace(/^\.\//, "");
}

function parseCaptchaUrl(html) {
  const tags = String(html).match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (/CAPTCHA|CaptchaImage|LBD_CaptchaImage/i.test(tag)) {
      const src = attr(tag, "src");
      if (src) return absoluteUrl(src);
    }
  }
  const m = String(html).match(/BotDetectCaptcha\.ashx\?get=image[^"' <]+/i);
  return m ? absoluteUrl(m[0]) : "";
}

function elementById(html, id) {
  const re = new RegExp(`<([a-z0-9]+)\\b([^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*)>`, "i");
  const m = re.exec(String(html || ""));
  if (!m) return null;

  const close = new RegExp(`</${m[1]}>`, "i");
  const rest = String(html).slice(m.index + m[0].length);
  const end = close.exec(rest);
  return {
    attrs: m[2],
    body: end ? rest.slice(0, end.index) : "",
  };
}

function extractResultFields(html) {
  const fields = {};
  for (const key of Object.keys(RESULT_IDS)) {
    const ids = Array.isArray(RESULT_IDS[key]) ? RESULT_IDS[key] : [RESULT_IDS[key]];
    for (const id of ids) {
      const el = elementById(html, id);
      if (!el) continue;
      fields[key] = cleanText(el.body);
      if (key === "contactText") fields.contactUrl = absoluteUrl(attr(el.attrs, "href"));
      break;
    }
  }
  return fields;
}

function addKnownFields(form, captcha = "") {
  form[FIELD.type] = DATA.type;
  form[FIELD.location] = DATA.location;
  form[FIELD.caseNumber] = DATA.applicationId;
  form[FIELD.passport] = DATA.passport;
  form[FIELD.surname] = DATA.surname;
  if (captcha) form[FIELD.captcha] = captcha;
}

function encodeForm(form) {
  return Object.entries(form)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value == null ? "" : String(value))}`)
    .join("&");
}

function parseResult(html) {
  const fields = extractResultFields(html);

  if (fields.status || fields.message) {
    return {
      status: fields.status || "Checked",
      appName: fields.appName,
      caseNumber: fields.caseNumber || DATA.applicationId,
      caseCreated: fields.caseCreated,
      caseLastUpdated: fields.caseLastUpdated,
      message: fields.message,
      contactText: fields.contactText,
      contactUrl: fields.contactUrl,
      detail: [fields.message, fields.contactText].filter(Boolean).join("\n\n"),
    };
  }

  const text = cleanText(html);
  if (/captcha|code entered|code you entered|code as shown|validation/i.test(text)) {
    return {
      status: "Captcha failed",
      caseNumber: DATA.applicationId,
      message: "The captcha was rejected or CEAC asked for a new code. Try a fresh image.",
      detail: text.slice(0, 700),
    };
  }

  const statusMatch = text.match(/Issued|Refused|Administrative Processing|Ready|Application Received|No Status/i);
  return {
    status: statusMatch ? statusMatch[0] : "Checked",
    caseNumber: DATA.applicationId,
    message: text.slice(0, 900),
    detail: text.slice(0, 1400),
  };
}

function errorResult(message) {
  return { status: "Error", detail: message || "Unknown error" };
}

function statusKind(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("issued") || value.includes("approved")) return "good";
  if (value.includes("refused")) return "refused";
  if (value.includes("administrative")) return "administrative";
  if (value.includes("ready") || value.includes("received") || value.includes("transit")) return "hopeful";
  if (value.includes("no status")) return "neutral";
  if (value.includes("captcha") || value.includes("error")) return "error";
  return "default";
}

function statusColor(status) {
  return new Color(STATUS_STYLES[statusKind(status)].color);
}

function statusGradient(status) {
  return STATUS_STYLES[statusKind(status)].gradient;
}

function statusSubtitle(result) {
  if (!result) return visaSubtitle();
  if (result.caseLastUpdated) return `Last updated ${result.caseLastUpdated}`;
  if (result.caseCreated) return `Created ${result.caseCreated}`;
  return displayCaseNumber(result.caseNumber);
}

async function startCeacSession() {
  cookies = {};
  let page = await loadString(CEAC_URL);
  let html = page.text;
  let form = parseInputs(html);

  if (!form.__VIEWSTATE || !form.__VIEWSTATEGENERATOR) {
    throw new Error("CEAC form did not load. It may be blocking Scriptable Request right now.");
  }

  form.__EVENTTARGET = POSTBACK_TARGET;
  form.__EVENTARGUMENT = "";
  addKnownFields(form);

  page = await loadString(CEAC_URL, "POST", encodeForm(form), {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://ceac.state.gov",
  });

  html = page.text;
  form = parseInputs(html);
  addKnownFields(form);

  const captchaUrl = parseCaptchaUrl(html);
  if (!captchaUrl) {
    throw new Error("Captcha image was not found after switching to NIV.");
  }

  const captchaImage = await loadImage(captchaUrl);
  return { html, form, captchaUrl, captchaImage };
}

async function refreshCaptcha(session) {
  return startCeacSession();
}

async function submitCaptcha(session, captcha) {
  const form = { ...session.form };
  form.__EVENTTARGET = FIELD.submit;
  form.__EVENTARGUMENT = "";
  addKnownFields(form, captcha);

  const res = await loadString(CEAC_URL, "POST", encodeForm(form), {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://ceac.state.gov",
  });

  return parseResult(res.text);
}

function drawRounded(ctx, x, y, w, h, r, color) {
  const path = new Path();
  path.addRoundedRect(new Rect(x, y, w, h), r, r);
  ctx.addPath(path);
  ctx.setFillColor(color);
  ctx.fillPath();
}

function drawImageAspectFit(ctx, image, rect) {
  const size = image && image.size ? image.size : null;
  const imageWidth = size && size.width ? size.width : rect.width;
  const imageHeight = size && size.height ? size.height : rect.height;
  const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const x = rect.x + (rect.width - width) / 2;
  const y = rect.y + (rect.height - height) / 2;
  ctx.drawImageInRect(image, new Rect(x, y, width, height));
}

function imageRow(image, height, onSelect = null, dismiss = false) {
  const row = new UITableRow();
  row.height = height;
  row.backgroundColor = new Color("#f5f7fb");
  row.dismissOnSelect = dismiss;
  if (onSelect) row.onSelect = onSelect;
  const cell = row.addImage(image);
  cell.centerAligned();
  return row;
}

function headerRow() {
  const row = new UITableRow();
  row.height = 62;
  row.backgroundColor = new Color("#f5f7fb");
  row.cellSpacing = 12;

  const left = row.addText(appTitle(), visaSubtitle());
  left.widthWeight = 1;
  left.titleFont = Font.boldRoundedSystemFont(22);
  left.subtitleFont = Font.mediumSystemFont(14);
  left.titleColor = new Color("#102538");
  left.subtitleColor = new Color("#6b7b8d");

  const right = row.addText(displayCaseNumber(), maskPassport(DATA.passport));
  right.widthWeight = 1;
  right.titleFont = Font.semiboldRoundedSystemFont(14);
  right.subtitleFont = Font.mediumSystemFont(13);
  right.titleColor = new Color("#102538");
  right.subtitleColor = new Color("#6b7b8d");
  right.rightAligned();

  return row;
}

function labelRow(title) {
  const row = new UITableRow();
  row.height = 28;
  row.backgroundColor = new Color("#f5f7fb");
  const cell = row.addText(title, "");
  cell.titleFont = Font.semiboldSystemFont(13);
  cell.titleColor = new Color("#6b7b8d");
  return row;
}

function makeCaptchaImage(image) {
  const ctx = new DrawContext();
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.size = new Size(760, 190);

  drawRounded(ctx, 32, 12, 696, 150, 22, new Color("#ffffff"));
  drawRounded(ctx, 58, 36, 644, 102, 16, new Color("#edf4fb"));
  drawImageAspectFit(ctx, image, new Rect(92, 48, 576, 78));
  return ctx.getImage();
}

function rowText(title, subtitle = "", color = null, height = 54) {
  const row = new UITableRow();
  row.height = height;
  row.backgroundColor = new Color("#f5f7fb");
  const cell = row.addText(title, subtitle);
  cell.titleFont = Font.semiboldSystemFont(16);
  cell.subtitleFont = Font.systemFont(12);
  if (color) cell.titleColor = color;
  return row;
}

function detailRow(title, subtitle = "", color = null, height = 54) {
  const row = new UITableRow();
  row.height = height;
  row.backgroundColor = new Color("#f5f7fb");
  const cell = row.addText(title, subtitle);
  cell.titleFont = Font.semiboldSystemFont(14);
  cell.subtitleFont = Font.systemFont(11);
  cell.titleColor = color || new Color("#28394d");
  cell.subtitleColor = new Color("#111827");
  return row;
}

function statusRow(result) {
  const row = new UITableRow();
  row.height = 74;
  row.backgroundColor = new Color("#f5f7fb");
  const status = result.status || "Checked";
  const cell = row.addText(`●  ${status}`, statusSubtitle(result));
  cell.titleFont = Font.boldRoundedSystemFont(22);
  cell.subtitleFont = Font.mediumSystemFont(13);
  cell.titleColor = statusColor(result.status);
  cell.subtitleColor = new Color("#6b7b8d");
  return row;
}

function actionRow(title, color, onSelect, dismiss = false) {
  const row = new UITableRow();
  row.height = 48;
  row.backgroundColor = new Color("#f5f7fb");
  row.dismissOnSelect = dismiss;
  const cell = row.addButton(title);
  cell.centerAligned();
  cell.titleColor = color instanceof Color ? color : new Color(color);
  cell.titleFont = Font.semiboldSystemFont(17);
  cell.onTap = onSelect;
  cell.dismissOnTap = dismiss;
  return row;
}

function loadingRows(table, title, subtitle = "") {
  table.removeAllRows();
  table.addRow(rowText(title, subtitle, new Color("#0a66c2"), 70));
  table.reload();
}

function captchaActionsRow(onSubmit, onRefresh) {
  const row = new UITableRow();
  row.height = 50;
  row.backgroundColor = new Color("#f5f7fb");
  row.cellSpacing = 16;

  const submit = row.addButton("Enter code");
  submit.widthWeight = 1;
  submit.centerAligned();
  submit.titleColor = new Color("#0a66c2");
  submit.titleFont = Font.boldSystemFont(17);
  submit.onTap = onSubmit;
  submit.dismissOnTap = false;

  const refresh = row.addButton("New image");
  refresh.widthWeight = 1;
  refresh.centerAligned();
  refresh.titleColor = new Color("#4f6678");
  refresh.titleFont = Font.semiboldSystemFont(17);
  refresh.onTap = onRefresh;
  refresh.dismissOnTap = false;

  return row;
}

async function promptSettings() {
  const profile = readProfile();
  const alert = new Alert();
  alert.title = "CEAC Settings";
  alert.message = profile ? visaSubtitle() : "No saved profile";
  alert.addAction("Change location");
  alert.addAction("Edit profile");
  alert.addAction("Reset profile");
  alert.addCancelAction("Cancel");
  return alert.presentAlert();
}

function addResultRows(table, result) {
  table.addRow(statusRow(result));

  if (result.caseCreated) table.addRow(detailRow("Case Created", result.caseCreated, null, 44));
  if (result.caseLastUpdated) table.addRow(detailRow("Case Last Updated", result.caseLastUpdated, null, 44));

  const message = result.message || result.detail || "No readable detail returned.";
  const messageHeight = Math.min(300, Math.max(110, 64 + Math.ceil(message.length / 72) * 14));
  table.addRow(detailRow("Message", message, new Color("#28394d"), messageHeight));

  if (result.contactText || result.contactUrl) {
    table.addRow(detailRow("More Info", result.contactText || result.contactUrl, new Color("#0a66c2"), 50));
  }
}

function makeWidget() {
  const profile = readProfile();
  if (profile) DATA = profile;
  const last = readStoredResult();
  const widget = new ListWidget();
  widget.url = URLScheme.forRunningScript();
  widget.setPadding(14, 14, 14, 14);

  const gradient = new LinearGradient();
  gradient.colors = statusGradient(last && last.status).map((hex) => new Color(hex));
  gradient.locations = [0, 0.58, 1];
  widget.backgroundGradient = gradient;

  const head = widget.addStack();
  head.centerAlignContent();
  const icon = SFSymbol.named("doc.text.magnifyingglass");
  const iconImg = head.addImage(icon.image);
  iconImg.imageSize = new Size(18, 18);
  iconImg.tintColor = Color.white();
  head.addSpacer(6);
  const title = head.addText("CEAC");
  title.font = Font.semiboldSystemFont(15);
  title.textColor = Color.white();

  widget.addSpacer(9);

  const status = widget.addText(last ? last.status : profile ? "Tap to check" : "Configure");
  status.font = Font.boldRoundedSystemFont(21);
  status.textColor = Color.white();
  status.lineLimit = 2;
  status.minimumScaleFactor = 0.65;

  widget.addSpacer(4);

  const sub = widget.addText(last ? statusSubtitle(last) : profile ? visaSubtitle() : "Run script once");
  sub.font = Font.mediumSystemFont(12);
  sub.textColor = new Color("#d8f0ef");
  sub.lineLimit = 1;
  sub.minimumScaleFactor = 0.7;

  widget.addSpacer();

  const foot = widget.addText(formatTime(last && last.updatedAt));
  foot.font = Font.mediumSystemFont(11);
  foot.textColor = new Color("#c4dad9");
  foot.textOpacity = 0.9;

  return widget;
}

async function promptCaptcha() {
  const alert = new Alert();
  alert.title = "CAPTCHA";
  alert.addTextField("Code", "");
  alert.addAction("Submit");
  alert.addCancelAction("Cancel");
  const idx = await alert.presentAlert();
  if (idx < 0) return "";
  return alert.textFieldValue(0).trim().toUpperCase();
}

async function showResult(result) {
  saveStoredResult(result);

  const table = new UITable();
  table.showSeparators = false;
  addResultRows(table, result);
  table.addRow(actionRow("Done", new Color("#4f6678"), () => {}, true));
  await table.present(true);
}

async function runInteractive() {
  let session;
  try {
    await ensureProfile();
    session = await startCeacSession();
  } catch (error) {
    const result = errorResult(String(error && error.message ? error.message : error));
    saveStoredResult(result);
    await showResult(result);
    return;
  }

  const table = new UITable();
  table.showSeparators = false;

  async function reloadSession(title = "Loading") {
    loadingRows(table, title, visaSubtitle());
    session = await startCeacSession();
    await render();
    table.reload();
  }

  async function render() {
    table.removeAllRows();

    table.addRow(headerRow());
    table.addRow(labelRow("CAPTCHA"));
    table.addRow(imageRow(makeCaptchaImage(session.captchaImage), 96));

    table.addRow(
      captchaActionsRow(async () => {
        const captcha = await promptCaptcha();
        if (!captcha) return;
        table.removeAllRows();
        table.addRow(rowText("Submitting", "Checking CEAC status...", new Color("#0a66c2"), 70));
        table.reload();
        try {
          const result = await submitCaptcha(session, captcha);
          saveStoredResult(result);
          table.removeAllRows();
          addResultRows(table, result);
          table.addRow(actionRow("New check", new Color("#4f6678"), async () => {
            try {
              session = await startCeacSession();
              await render();
              table.reload();
            } catch (error) {
              const result = errorResult(String(error && error.message ? error.message : error));
              saveStoredResult(result);
              table.removeAllRows();
              table.addRow(rowText("Error", result.detail, new Color("#b00020"), 160));
              table.reload();
            }
          }));
          table.reload();
        } catch (error) {
          const result = errorResult(String(error && error.message ? error.message : error));
          saveStoredResult(result);
          table.removeAllRows();
          table.addRow(rowText("Submit failed", result.detail, new Color("#b00020"), 180));
          table.addRow(actionRow("Try another code", new Color("#4f6678"), async () => {
            try {
              session = await refreshCaptcha(session);
              await render();
              table.reload();
            } catch (_) {}
          }));
          table.reload();
        }
      }, async () => {
        try {
          session = await refreshCaptcha(session);
          await render();
          table.reload();
        } catch (error) {
          const result = errorResult(String(error && error.message ? error.message : error));
          saveStoredResult(result);
        }
      })
    );

    table.addRow(actionRow("Settings", new Color("#4f6678"), async () => {
      const option = await promptSettings();
      if (option < 0) return;

      try {
        if (option === 0) {
          const updated = await changeLocation();
          if (updated) await reloadSession("Location updated");
          return;
        }

        if (option === 1) {
          const updated = await promptProfile(readProfile() || DATA);
          if (updated) await reloadSession("Profile updated");
          return;
        }

        if (option === 2) {
          const didReset = await resetProfile();
          if (!didReset) return;
          table.removeAllRows();
          table.addRow(rowText("Profile reset", "Run this script again to configure.", new Color("#4f6678"), 90));
          table.reload();
        }
      } catch (error) {
        const result = errorResult(String(error && error.message ? error.message : error));
        saveStoredResult(result);
        table.removeAllRows();
        table.addRow(rowText("Settings failed", result.detail, new Color("#b00020"), 150));
        table.reload();
      }
    }));
  }

  await render();
  await table.present(true);
}

if (config.runsInWidget) {
  Script.setWidget(makeWidget());
  Script.complete();
} else {
  await runInteractive();
  Script.complete();
}
