// 自動生成：kango_week_gas/tools/build_web_logic.mjs。直接編集しない（元は kango_week_gas/Logic.gs）。
var KangoWeek = (function () {
// 看護 曜日の訪問盤の判定（純粋関数のみ。シート・画面には触れない）。
// 画面は tools/build_web_logic.mjs が作る写し webapp/logic.js（KangoWeek.*）で同じものを使う。
var T0 = 540, T1 = 1020;          // 盤面は 9:00〜17:00
var DOWS = ['日', '月', '火', '水', '木', '金', '土'];
var KINDS = ['サ担', '会議', '契約', 'その他'];
var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
var LANE_RE = /^[A-H]$/;
var INS_LABEL = { k: '介護', i: '医療', m: 'その他' };
var TABS = {
  '利用者': ['ID', '氏名', '保険', '新規', '開始日', '終了日', 'メモ', '標準分', '休止開始', '再開予定', '休止理由'],
  '型': ['ID', '利用者ID', '曜日', '列', '開始', '分', '週', '期間開始', '期間終了', '特指示'],
  '予定': ['ID', '種類', '内容', '日付', '曜日', '毎週', '列', '開始', '分'],
  '設定': ['キー', '値'],
};

function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function num_(v, dflt) {
  if (v == null || String(v).trim() === '') return dflt;
  var n = Number(v);
  return isFinite(n) ? n : dflt;
}
function parseHm(s) {
  var m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(String(s == null ? '' : s));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || (m[3] && Number(m[3]) > 59)) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function fmtHm(m) { return Math.floor(m / 60) + ':' + pad2_(m % 60); }

// 表示ゆれをそろえる。存在しない日付は読めない値として扱う。
function normDate(s) {
  var m = /^\s*(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*$/.exec(String(s == null ? '' : s));
  if (!m) return '';
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return '';
  return m[1] + '-' + pad2_(Number(m[2])) + '-' + pad2_(Number(m[3]));
}
function parseDate_(s) { return new Date(s + 'T00:00:00Z'); }
function dowOf(date) { return parseDate_(date).getUTCDay(); }
function weekOfMonth(date) { return Math.ceil(Number(date.split('-')[2]) / 7); }
function addDays(date, n) {
  var d = parseDate_(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}
function mondayOf(date) { return addDays(date, -((dowOf(date) + 6) % 7)); }
function md_(date) { var p = date.split('-'); return Number(p[1]) + '/' + Number(p[2]); }

// 画面から届いた状態を、欠けた欄を既定値で埋めた形にする。
function normalizeState(o) {
  o = o || {};
  return {
    clients: (o.clients || []).map(function (c) {
      return { id: String(c.id), name: String(c.name || ''), ins: INS_LABEL[c.ins] ? c.ins : 'k', isNew: !!c.isNew,
        start: normDate(c.start), end: normDate(c.end), note: String(c.note || ''), defMin: num_(c.defMin, 60),
        pause: c.pause && c.pause.from ? { from: normDate(c.pause.from), until: normDate(c.pause.until), reason: String(c.pause.reason || '') } : null };
    }),
    slots: (o.slots || []).map(function (s) {
      var w = (Array.isArray(s.weeks) ? s.weeks : []).map(Number).filter(function (x) { return Number.isInteger(x) && x >= 1 && x <= 5; });
      return { id: String(s.id), clientId: String(s.clientId), dow: num_(s.dow, 0), lane: String(s.lane || ''),
        start: num_(s.start, -1), min: num_(s.min, 0), weeks: w.length ? w : null, from: normDate(s.from), to: normDate(s.to), sp: !!s.sp };
    }),
    events: (o.events || []).map(function (e) {
      var date = e.weekly ? '' : normDate(e.date);
      return { id: String(e.id), kind: KINDS.indexOf(e.kind) >= 0 ? e.kind : 'その他', title: String(e.title || ''), date: date,
        dow: date ? dowOf(date) : num_(e.dow, 0), weekly: !!e.weekly, lane: String(e.lane || ''), start: num_(e.start, -1), min: num_(e.min, 0) };
    }),
    settings: { lanes: (o.settings && o.settings.lanes && o.settings.lanes.length ? o.settings.lanes : ['A', 'B', 'C', 'D']).map(String) },
  };
}

// 問題ごとに1行。ID の形が悪ければ値そのものは返さない（画面の属性にも使うため）。
function validateState(state) {
  var errs = [], seen = Object.create(null), cid = Object.create(null);
  var idOk = function (kind, id) {
    if (!ID_RE.test(String(id))) { errs.push(kind + 'のIDの形が正しくない'); return false; }
    var k = kind + '|' + id;
    if (seen[k]) errs.push(kind + 'のIDが重複: ' + id);
    seen[k] = true;
    return true;
  };
  var dayOk = function (d) { return Number.isInteger(d) && d >= 1 && d <= 5; };
  var timeOk = function (s, m) { return Number.isInteger(s) && Number.isInteger(m) && s >= 0 && s < 1440 && m >= 1 && m <= 600; };
  var laneOk = function (l) { return LANE_RE.test(String(l)) && state.settings.lanes.indexOf(l) >= 0; };
  state.clients.forEach(function (c) {
    if (!idOk('利用者', c.id)) return;
    cid[c.id] = true;
    if (c.pause && (!normDate(c.pause.from) || (c.pause.until && (!normDate(c.pause.until) || c.pause.until <= c.pause.from)))) errs.push('休止の開始日・再開予定日が正しくない: ' + c.id);
  });
  state.slots.forEach(function (s) {
    if (!idOk('枠', s.id)) return;
    if (!cid[s.clientId]) errs.push('枠の利用者が見つからない: ' + s.id);
    else if (!dayOk(s.dow) || !laneOk(s.lane) || !timeOk(s.start, s.min) || (s.from && s.to && s.to < s.from)) errs.push('枠の曜日・列・時刻・期間が正しくない: ' + s.id);
  });
  state.events.forEach(function (e) {
    if (!idOk('予定', e.id)) return;
    if (!dayOk(e.dow) || (!e.weekly && !normDate(e.date)) || !laneOk(e.lane) || !timeOk(e.start, e.min)) errs.push('予定の日付・曜日・列・時刻が正しくない: ' + e.id);
  });
  if (!state.settings.lanes.length || !state.settings.lanes.every(function (l) { return LANE_RE.test(String(l)); })) errs.push('列の名前が正しくない');
  return errs;
}

// シートを人が手で直して読めない値が入った所。値そのもの（氏名が混じりうる）は書かない。
function tableProblems(tables) {
  var out = [];
  var check = function (tab, rules) {
    var rows = tables[tab] || [];
    if (!rows.length) return;
    var head = rows[0].map(function (h) { return String(h).trim(); });
    rows.slice(1).forEach(function (r, i) {
      if (!r.some(function (v) { return String(v == null ? '' : v).trim() !== ''; })) return;
      Object.keys(rules).forEach(function (col) {
        var j = head.indexOf(col), v = j < 0 ? '' : String(r[j] == null ? '' : r[j]).trim();
        if (!rules[col](v, r, head)) out.push(tab + ' ' + (i + 2) + '行目：' + col + 'が読めない');
      });
    });
  };
  var date = function (req) { return function (v) { return v === '' ? !req : !!normDate(v); }; };
  var minutes = function (v) { return Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 600; };
  var dow = function (v) { return DOWS.indexOf(v) >= 1 && DOWS.indexOf(v) <= 5; };
  check('利用者', { '開始日': date(false), '終了日': date(false), '標準分': function (v) { return v === '' || minutes(v); }, '休止開始': date(false), '再開予定': date(false) });
  check('型', { '曜日': dow, '開始': function (v) { return parseHm(v) !== null; }, '分': minutes,
    '週': function (v) { return v === '' || v.split(',').every(function (x) { return /^[1-5]$/.test(x.trim()); }); }, '期間開始': date(false), '期間終了': date(false) });
  check('予定', { '日付': function (v, r, h) { return date(String(r[h.indexOf('毎週')]).trim() !== '毎週')(v); },
    '曜日': dow, '開始': function (v) { return parseHm(v) !== null; }, '分': minutes });
  return out;
}

// 状態 → シートのタブ（見出し行つきの2次元配列。値はすべて文字列）。
function stateToTables(state) {
  var t = {};
  Object.keys(TABS).forEach(function (k) { t[k] = [TABS[k].slice()]; });
  state.clients.forEach(function (c) {
    var p = c.pause;
    t['利用者'].push([c.id, c.name, INS_LABEL[c.ins], c.isNew ? '新規' : '', c.start, c.end, c.note, String(c.defMin), p ? p.from : '', p ? p.until : '', p ? p.reason : '']);
  });
  state.slots.forEach(function (s) {
    t['型'].push([s.id, s.clientId, DOWS[s.dow], s.lane, fmtHm(s.start), String(s.min), s.weeks ? s.weeks.join(',') : '', s.from, s.to, s.sp ? '特指示' : '']);
  });
  state.events.forEach(function (e) { t['予定'].push([e.id, e.kind, e.title, e.date, DOWS[e.dow], e.weekly ? '毎週' : '', e.lane, fmtHm(e.start), String(e.min)]); });
  t['設定'].push(['列', state.settings.lanes.join(',')]);
  return t;
}

// シートのタブ → 状態。見出しの名前で列を引くので、列の並びが変わっても読める。
function stateFromTables(tables) {
  var recs = function (name) {
    var rows = tables[name] || [];
    if (!rows.length) return [];
    return rows.slice(1).filter(function (r) { return r.some(function (v) { return String(v == null ? '' : v).trim() !== ''; }); }).map(function (r) {
      var o = {};
      rows[0].forEach(function (h, i) { o[String(h).trim()] = String(r[i] == null ? '' : r[i]).trim(); });
      return o;
    });
  };
  var conf = {};
  recs('設定').forEach(function (r) { conf[r['キー']] = r['値']; });
  return normalizeState({
    clients: recs('利用者').map(function (r) {
      var ins = Object.keys(INS_LABEL).filter(function (k) { return INS_LABEL[k] === r['保険']; })[0];
      return { id: r['ID'], name: r['氏名'], ins: ins, isNew: r['新規'] === '新規', start: r['開始日'], end: r['終了日'], note: r['メモ'], defMin: r['標準分'],
        pause: r['休止開始'] ? { from: r['休止開始'], until: r['再開予定'], reason: r['休止理由'] } : null };
    }),
    slots: recs('型').map(function (r) { return { id: r['ID'], clientId: r['利用者ID'], dow: DOWS.indexOf(r['曜日']), lane: r['列'], start: parseHm(r['開始']), min: r['分'],
      weeks: r['週'] ? r['週'].split(',') : null, from: r['期間開始'], to: r['期間終了'], sp: r['特指示'] === '特指示' }; }),
    events: recs('予定').map(function (r) { return { id: r['ID'], kind: r['種類'], title: r['内容'], date: r['日付'], dow: DOWS.indexOf(r['曜日']), weekly: r['毎週'] === '毎週', lane: r['列'], start: parseHm(r['開始']), min: r['分'] }; }),
    settings: { lanes: conf['列'] ? conf['列'].split(',').map(function (x) { return x.trim(); }).filter(String) : [] },
  });
}

// 確定の前後で変わった件数（変更履歴に残す。氏名は含めない）。
function summarizeDiff(before, after) {
  var count = function (a, b) {
    var m = Object.create(null), n = 0;
    a.forEach(function (x) { m[x.id] = JSON.stringify(x); });
    b.forEach(function (x) { if (m[x.id] !== JSON.stringify(x)) n++; delete m[x.id]; });
    return n + Object.keys(m).length;
  };
  return { clients: count(before.clients, after.clients), slots: count(before.slots, after.slots), events: count(before.events, after.events) };
}

// 休止の再開予定日からは元の型に戻る。
function pausedOn_(c, date) {
  var p = c.pause;
  return !!(p && p.from && p.from <= date && (!p.until || date < p.until));
}

// 曜日ごとの盤。日付の見方だけ各日で判定し、型の見方では今日を基準にする。
function boardFor(state, view, today) {
  var byId = Object.create(null), tray = [], paused = [], ended = [];
  state.clients.forEach(function (c) {
    byId[c.id] = c;
    if (c.end && c.end < today) return;
    if (pausedOn_(c, today)) {
      paused.push({ clientId: c.id, why: (c.pause.reason || '休止') + '（' + md_(c.pause.from) + 'から' + (c.pause.until ? '・' + md_(c.pause.until) + '再開予定' : '') + '）' });
    } else if (!state.slots.some(function (s) { return s.clientId === c.id; })) {
      tray.push({ key: 'u:' + c.id, clientId: c.id, min: c.defMin });
    }
  });
  state.slots.forEach(function (s) {
    if (s.to && s.to < today && byId[s.clientId] && !(byId[s.clientId].end && byId[s.clientId].end < today))
      ended.push({ key: 's:' + s.id, slotId: s.id, clientId: s.clientId, why: md_(s.to) + 'で終了' });
  });
  var days = [1, 2, 3, 4, 5].map(function (dow) {
    var dates = view.mode === 'dates', date = dates ? addDays(view.monday, dow - 1) : null;
    var ref = dates ? date : today, wk = dates ? weekOfMonth(date) : null, cards = [];
    state.slots.forEach(function (s) {
      var c = byId[s.clientId], w = s.weeks && s.weeks.length ? s.weeks.slice() : [1, 2, 3, 4, 5];
      if (!c || s.dow !== dow || (c.end && c.end < ref) || pausedOn_(c, ref) || (s.to && s.to < ref)) return;
      if (dates && ((c.start && c.start > date) || (s.from && s.from > date) || w.indexOf(wk) < 0)) return;
      if (view.mode === 'wk' && w.indexOf(view.wk) < 0) return;
      var tags = [];
      if (s.weeks && s.weeks.length) tags.push('第' + s.weeks.join('・') + '週');
      if (c.start && c.start > ref) tags.push(md_(c.start) + 'から');
      if (s.from && s.from > ref && s.from !== c.start) tags.push(md_(s.from) + 'から');
      if (s.sp) tags.push('特指示' + (s.to ? ' 〜' + md_(s.to) : ''));
      cards.push({ key: 's:' + s.id, kind: 's', lane: s.lane, start: s.start, min: s.min, tags: tags,
        wkSet: w, from: s.from, to: s.to, slotId: s.id, clientId: s.clientId, sp: s.sp });
    });
    state.events.forEach(function (e) {
      if (e.dow !== dow) return;
      if (!e.weekly && (dates ? e.date !== date : (!e.date || e.date < today || (view.mode === 'wk' && weekOfMonth(e.date) !== view.wk)))) return;
      cards.push({ key: 'e:' + e.id, kind: 'e', lane: e.lane, start: e.start, min: e.min,
        tags: [e.weekly ? '毎週' : md_(e.date)], wkSet: e.weekly ? [1, 2, 3, 4, 5] : [weekOfMonth(e.date)],
        from: e.weekly ? '' : e.date, to: e.weekly ? '' : e.date, eventId: e.id, evKind: e.kind, title: e.title });
    });
    return { dow: dow, date: date, wk: wk, cards: conflicts(cards, view) };
  });
  return { days: days, tray: tray, paused: paused, ended: ended };
}

// 重なりのかたまりごとに、空いた一番左の列に置く。元のカードは変えない。
function layoutLane(cards) {
  var sorted = cards.map(function (c) { return Object.assign({}, c); }).sort(function (a, b) { return a.start - b.start; });
  var group = [], ends = [], maxEnd = -1;
  var finish = function () { group.forEach(function (c) { c.cols = ends.length; }); group = []; ends = []; };
  sorted.forEach(function (c) {
    if (c.start >= maxEnd) finish();
    var col = 0;
    while (col < ends.length && ends[col] > c.start) col++;
    c.col = col;
    ends[col] = c.start + c.min;
    maxEnd = group.length ? Math.max(maxEnd, c.start + c.min) : c.start + c.min;
    group.push(c);
  });
  finish();
  return sorted;
}

// 同じ列・時刻で、週と期間の両方が交わるものだけ赤枠にする。
function conflicts(cards, view) {
  view = view || { mode: 'all' };
  var out = cards.map(function (c) { var x = Object.assign({}, c); delete x.bad; return x; });
  for (var i = 0; i < out.length; i++) {
    for (var j = i + 1; j < out.length; j++) {
      var a = out[i], b = out[j];
      if (a.lane !== b.lane || a.start >= b.start + b.min || b.start >= a.start + a.min) continue;
      if (view.mode !== 'dates') {
        var aw = a.wkSet && a.wkSet.length ? a.wkSet : [1, 2, 3, 4, 5];
        var bw = b.wkSet && b.wkSet.length ? b.wkSet : [1, 2, 3, 4, 5];
        if (!aw.some(function (w) { return bw.indexOf(w) >= 0 && (view.mode !== 'wk' || w === view.wk); })) continue;
        if ((a.to && b.from && a.to < b.from) || (b.to && a.from && b.to < a.from)) continue;
      }
      a.bad = true; b.bad = true;
    }
  }
  return out;
}

// 元の状態を変えず、型そのものの曜日・列・時刻を変える。
function moveCard(state, key, toDow, lane, start, view) {
  var s = JSON.parse(JSON.stringify(state));
  if (!/^[se]:[A-Za-z0-9_-]{1,40}$/.test(key)) return { state: state, error: 'カードの形が正しくありません' };
  var list = key.charAt(0) === 's' ? s.slots : s.events;
  var item = list.filter(function (x) { return x.id === key.slice(2); })[0];
  if (!item) return { state: state, error: 'カードが見つかりません' };
  if (key.charAt(0) === 'e' && !item.weekly) item.date = addDays(view.mode === 'dates' ? view.monday : mondayOf(item.date), toDow - 1);
  item.dow = toDow; item.lane = lane; item.start = start;
  var errs = validateState(s);
  return errs.length ? { state: state, error: errs[0] } : { state: s };
}

function defaultEventDate(view, dow, today) {
  return addDays(view.mode === 'dates' ? view.monday : addDays(mondayOf(today), 7), dow - 1);
}

// 特指示の型と同じ条件の枠を、まだない曜日にだけ足す。ID は呼び出し元から受け取る。
function setPeriodAllWeek(state, slotId, ids) {
  var src = state.slots.filter(function (s) { return s.id === slotId; })[0];
  if (!src || !src.sp) return { state: state, error: '特指示の枠を選んでください' };
  var fields = ['clientId', 'lane', 'start', 'min', 'from', 'to', 'sp'];
  var same = function (s) {
    var a = (s.weeks || []).slice().sort(), b = (src.weeks || []).slice().sort();
    return fields.every(function (k) { return s[k] === src[k]; }) && JSON.stringify(a) === JSON.stringify(b);
  };
  var missing = [1, 2, 3, 4, 5].filter(function (d) { return !state.slots.some(function (s) { return s.dow === d && same(s); }); });
  if (!Array.isArray(ids) || ids.length < missing.length) return { state: state, error: '追加する枠のIDが足りません' };
  var s = JSON.parse(JSON.stringify(state));
  missing.forEach(function (d, i) { var x = JSON.parse(JSON.stringify(src)); x.id = ids[i]; x.dow = d; s.slots.push(x); });
  var errs = validateState(s);
  return errs.length ? { state: state, error: errs[0] } : { state: s };
}

  return { T0: T0, T1: T1, DOWS: DOWS, TABS: TABS, KINDS: KINDS, parseHm: parseHm, fmtHm: fmtHm, normDate: normDate, dowOf: dowOf, weekOfMonth: weekOfMonth, addDays: addDays, mondayOf: mondayOf, normalizeState: normalizeState, validateState: validateState, tableProblems: tableProblems, stateToTables: stateToTables, stateFromTables: stateFromTables, summarizeDiff: summarizeDiff, boardFor: boardFor, layoutLane: layoutLane, conflicts: conflicts, moveCard: moveCard, defaultEventDate: defaultEventDate, setPeriodAllWeek: setPeriodAllWeek };
})();
