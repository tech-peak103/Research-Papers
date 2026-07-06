'use strict';

console.log('[Paper Editor] Script loaded');

/* ═══════════════════════════════════════════════════════════════
   ERROR DISPLAY
═══════════════════════════════════════════════════════════════ */
function showCriticalError(title, msg) {
    var t = document.getElementById('errTitle');
    var m = document.getElementById('errMsg');
    if (t) t.textContent = title;
    if (m) m.textContent = msg;
    var ov = document.getElementById('errorOverlay');
    if (ov) ov.classList.add('show');
    console.error('[Paper Editor]', title, msg);
}

if (typeof window.supabase === 'undefined') {
    showCriticalError('Supabase library failed to load', 'Check your internet and refresh.');
}
if (typeof window.Quill === 'undefined') {
    showCriticalError('Quill editor library failed to load', 'Check your internet and refresh.');
}

/* ═══════════════════════════════════════════════════════════════
   SUPABASE CONFIG
═══════════════════════════════════════════════════════════════ */
var SUPABASE_URL = 'https://uxhltsmddtuiqoadhdfd.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aGx0c21kZHR1aXFvYWRoZGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc2NDIsImV4cCI6MjA5NTAwMzY0Mn0.oKwtLMYhOpj_z4W-G9aEe1kmp9_q6sLDl273dQLBfbw';

var IS_LIVE = SUPABASE_URL && SUPABASE_URL.indexOf('https://') === 0;
var sb = null;
try {
    if (IS_LIVE && window.supabase) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    showCriticalError('Supabase init failed', e.message);
}

/* ═══════════════════════════════════════════════════════════════
   SESSION  (per-tab — dashboards jaisा hi: pehle sessionStorage,
   phir localStorage fallback, aur result ko sessionStorage me pin.
   Isse doosri tab ka (alag role ka) localStorage is tab ko nahi
   badlega — warna "Back to Dashboard" galat role ke dashboard par
   chala jaata tha, ya editor galat role me khulta tha.)
═══════════════════════════════════════════════════════════════ */
function loadSession() {
    var raw = sessionStorage.getItem('sc_user') || localStorage.getItem('sc_user');
    if (!raw) return null;
    try {
        var u = JSON.parse(raw);
        sessionStorage.setItem('sc_user', raw);
        return u;
    } catch (e) {
        return null;
    }
}
var USER = loadSession();

if (!USER || !USER.id) {
    window.location.href = 'index.html';
}

/* Privileged = student ke alawa sab (writer / admin / co_admin) */
var PRIV = USER && (USER.role === 'admin' || USER.role === 'co_admin' ||
    USER.role === 'writer');
var IS_WRITER = USER && (USER.role === 'writer');

function dashFor(role) {
    if (role === 'admin' || role === 'co_admin') return 'admin-dashboard.html';
    if (role === 'writer') return 'writer-dashboard.html';
    return 'student-dashboard.html';
}

var urlParams = new URLSearchParams(window.location.search);
var PAPER_ID = urlParams.get('id');
var BACK_URL = dashFor(USER.role);

if (!PAPER_ID) {
    window.location.href = BACK_URL;
}

/* Back button + badge */
var backLink = document.getElementById('edBackLink');
if (backLink) backLink.href = BACK_URL;

if (PRIV) {
    var badge = document.getElementById('editBadge');
    if (badge) {
        var roleLabel = USER.role === 'admin' ? 'Admin' :
            USER.role === 'co_admin' ? 'Co-Admin' : 'Writer';
        badge.textContent = roleLabel + ' Edit Mode';
        badge.classList.add('show');
    }
}

function goBackToDashboard() {
    window.location.href = BACK_URL;
}


var PAPER = null;
var _isLoading = true;
var _saveTimer = null;
var _lastSavedContent = ''; // papers table me jo current hai
var _lastVersionContent = ''; // last snapshot ka content
var _lastVersionTime = 0; // last snapshot kab bana (ms)
var _versions = []; // loaded history list
var _selectedImg = null;

/* ─── TOAST ─── */
var _tt;

function toast(msg, type) {
    type = type || '';
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(_tt);
    _tt = setTimeout(function () {
        el.className = '';
    }, 3000);
}

function fmtWhen(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return d;
    }
}

/* ═══════════════════════════════════════════════════════════════
   QUILL EDITOR
═══════════════════════════════════════════════════════════════ */
var quill = null;
try {
    if (window.Quill) {
        quill = new Quill('#editor', {
            theme: 'snow',
            placeholder: 'Begin your paper here...',
            modules: {
                toolbar: {
                    container: [
                        [{
                            'header': [1, 2, 3, false]
                        }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{
                            'list': 'ordered'
                        }, {
                            'list': 'bullet'
                        }],
                        [{
                            'indent': '-1'
                        }, {
                            'indent': '+1'
                        }],
                        [{
                            'align': []
                        }],
                        ['blockquote', 'code-block'],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: function () {
                            insertImage(this.quill);
                        }
                    }
                }
            }
        });
        console.log('[Paper Editor] Quill initialized');
    }
} catch (e) {
    showCriticalError('Editor init failed', e.message);
}

/* ─── IMAGE INSERT ─── */
function insertImage(quillInstance) {
    var input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();
    input.onchange = function () {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast('Image too large! Max 5MB allowed.', 'error');
            return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
            var range = quillInstance.getSelection(true);
            quillInstance.insertEmbed(range.index, 'image', e.target.result, 'user');
            quillInstance.setSelection(range.index + 1);
            toast('Image inserted! Click on it to resize.', 'success');
        };
        reader.onerror = function () {
            toast('Failed to read image', 'error');
        };
        reader.readAsDataURL(file);
    };
}

/* ─── IMAGE RESIZE ─── */
if (quill) {
    quill.root.addEventListener('click', function (e) {
        if (e.target && e.target.tagName === 'IMG') selectImage(e.target);
        else deselectImage();
    });
    document.addEventListener('click', function (e) {
        var toolbar = document.getElementById('imgResizeToolbar');
        var editor = quill.root;
        if (!editor.contains(e.target) && toolbar && !toolbar.contains(e.target)) deselectImage();
    });
}

function selectImage(img) {
    var prev = quill.root.querySelectorAll('img.selected-img');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('selected-img');
    _selectedImg = img;
    img.classList.add('selected-img');
    var toolbar = document.getElementById('imgResizeToolbar');
    if (!toolbar) return;
    var editorRect = document.querySelector('.editor-card').getBoundingClientRect();
    var imgRect = img.getBoundingClientRect();
    var top = imgRect.top - editorRect.top - 45;
    var left = imgRect.left - editorRect.left;
    if (top < 5) top = imgRect.bottom - editorRect.top + 8;
    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
    toolbar.classList.add('show');
}

function deselectImage() {
    if (_selectedImg) {
        _selectedImg.classList.remove('selected-img');
        _selectedImg = null;
    }
    var toolbar = document.getElementById('imgResizeToolbar');
    if (toolbar) toolbar.classList.remove('show');
}

function resizeImg(percent) {
    if (!_selectedImg) return;
    _selectedImg.style.width = percent + '%';
    _selectedImg.style.height = 'auto';
    _selectedImg.setAttribute('width', percent + '%');
    setTimeout(function () {
        if (_selectedImg) selectImage(_selectedImg);
    }, 50);
    scheduleSave();
    toast('Image resized to ' + percent + '%', 'success');
}

function customResize() {
    if (!_selectedImg) return;
    var current = _selectedImg.style.width || '100%';
    var input = prompt('Enter image width (in percentage, e.g., 40):', current.replace('%', ''));
    if (input === null) return;
    var num = parseInt(input, 10);
    if (isNaN(num) || num < 5 || num > 100) {
        toast('Please enter a number between 5 and 100', 'error');
        return;
    }
    resizeImg(num);
}

function deleteImg() {
    if (!_selectedImg) return;
    if (!confirm('Delete this image?')) return;
    _selectedImg.remove();
    deselectImage();
    scheduleSave();
    toast('Image deleted', 'success');
}

/* ─── WORD COUNT ─── */
function updateCounts() {
    if (!quill) return 0;
    var text = quill.getText().trim();
    var words = text ? text.split(/\s+/).filter(function (w) {
        return w.length;
    }).length : 0;
    var chars = text.length;
    var minutes = Math.max(1, Math.ceil(words / 200));
    document.getElementById('wordCount').textContent = words;
    document.getElementById('charCount').textContent = chars;
    document.getElementById('readTime').textContent = minutes + ' min';
    return words;
}

function setStatus(type, text) {
    var el = document.getElementById('saveStatus');
    if (!el) return;
    el.className = 'ed-status ' + type;
    document.getElementById('saveText').textContent = text;
}

/* ═══════════════════════════════════════════════════════════════
   LOAD PAPER
   - student: sirf apna paper
   - writer/admin/co_admin: koi bhi paper edit kar sakta hai
═══════════════════════════════════════════════════════════════ */
async function loadPaper() {
    if (!sb) {
        showCriticalError('Database not connected', 'Supabase client not initialized.');
        return;
    }
    try {
        var query = sb.from('papers').select('*').eq('id', PAPER_ID);
        if (!PRIV) query = query.eq('student_id', USER.id);

        var result = await query.maybeSingle();
        if (result.error) {
            showCriticalError('Database error', result.error.message);
            return;
        }
        if (!result.data) {
            showCriticalError('Paper not found', 'This paper does not exist or you do not have access.');
            return;
        }

        PAPER = result.data;
        document.getElementById('docTitle').value = PAPER.title || '';
        document.getElementById('docAbstract').value = PAPER.abstract || '';
        document.getElementById('docTrack').value = PAPER.track || 'research';
        document.getElementById('docStatus').value = PAPER.status || 'draft';

        if (PAPER.content && quill) {
            quill.root.innerHTML = PAPER.content;
            _lastSavedContent = PAPER.content;
        }
        _lastVersionContent = PAPER.content || '';
        _lastVersionTime = 0; // pehla changed-save hamesha ek checkpoint banayega
        updateCounts();

        if (PAPER.updated_at) {
            document.getElementById('lastSavedTime').textContent = 'Last saved: ' + fmtWhen(PAPER.updated_at);
        }

        _isLoading = false;
        setStatus('saved', 'All changes saved');
        loadVersions(); // history background me load kar lo

    } catch (e) {
        showCriticalError('Failed to load paper', e.message);
    }
}

/* ═══════════════════════════════════════════════════════════════
   SAVE  (papers update + version snapshot + collaborator link)
═══════════════════════════════════════════════════════════════ */
async function doSave(isManual, note) {
    if (_isLoading || !PAPER || !sb || !quill) return;

    var title = document.getElementById('docTitle').value.trim() || 'Untitled Paper';
    var abstract = document.getElementById('docAbstract').value.trim();
    var track = document.getElementById('docTrack').value;
    var status = document.getElementById('docStatus').value;
    var content = quill.root.innerHTML;
    var words = updateCounts();
    var nowIso = new Date().toISOString();

    setStatus('saving', 'Saving...');

    try {
        var result = await sb.from('papers').update({
            title: title,
            abstract: abstract,
            track: track,
            status: status,
            content: content,
            word_count: words,
            updated_at: nowIso,
            last_editor_name: USER.full_name,
            last_editor_role: USER.role,
            last_edited_at: nowIso
        }).eq('id', PAPER_ID);
        if (result.error) throw result.error;

        _lastSavedContent = content;
        setStatus('saved', 'All changes saved');
        document.getElementById('lastSavedTime').textContent = 'Last saved: ' + fmtWhen(nowIso);

        /* Writer ne edit kiya → use is paper ka collaborator bana do
           (taaki admin dashboard "kis writer ke kitne students" dikha sake).
           Note: paper_collaborators ka column DB me 'judge_id' hi hai — wo
           bas ek column naam hai (writer ki id store karta hai), isliye chhoda hai. */
        if (IS_WRITER) {
            try {
                await sb.from('paper_collaborators')
                    .upsert({
                        paper_id: PAPER_ID,
                        judge_id: USER.id,
                        can_edit: true
                    }, {
                        onConflict: 'paper_id,judge_id'
                    });
            } catch (ce) {
                /* non-critical */ }
        }

        /* VERSION SNAPSHOT — content badla ho, aur (manual ho ya 60s+ ho gaye ho) */
        var changed = content !== _lastVersionContent;
        var throttleOk = (Date.now() - _lastVersionTime) >= 60000;
        if (changed && (isManual || throttleOk)) {
            try {
                await sb.from('paper_versions').insert({
                    paper_id: PAPER_ID,
                    title: title,
                    abstract: abstract,
                    content: content,
                    track: track,
                    word_count: words,
                    editor_id: USER.id,
                    editor_name: USER.full_name,
                    editor_role: USER.role,
                    change_note: note || null
                });
                _lastVersionContent = content;
                _lastVersionTime = Date.now();
                loadVersions(); // refresh history list
            } catch (ve) {
                console.warn('version snapshot failed', ve);
            }
        }

    } catch (e) {
        setStatus('error', 'Save failed');
        toast('Save error: ' + e.message, 'error');
    }
}

function autoSave() {
    return doSave(false, null);
}

function scheduleSave() {
    if (_isLoading) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(autoSave, 1500);
}

if (quill) {
    quill.on('text-change', function () {
        scheduleSave();
        updateCounts();
    });
}
['docTitle', 'docAbstract', 'docTrack', 'docStatus'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', scheduleSave);
        el.addEventListener('change', scheduleSave);
    }
});

function manualSave() {
    clearTimeout(_saveTimer);
    doSave(true, null).then(function () {
        toast('Saved! Checkpoint created ✓', 'success');
    });
}

/* Refresh par bina "leave site?" dialog ke ek silent save try karo */
window.addEventListener('beforeunload', function () {
    if (!_isLoading && quill && quill.root.innerHTML !== _lastSavedContent) {
        try {
            autoSave();
        } catch (e) {}
    }
});

/* ═══════════════════════════════════════════════════════════════
   ⭐ VERSION HISTORY (Google-Docs jaisa)
═══════════════════════════════════════════════════════════════ */
function roleBadge(role) {
    var cls = 'role-' + (role || 'student');
    var label = role === 'admin' ? 'Admin' :
        role === 'co_admin' ? 'Co-Admin' :
        role === 'writer' ? 'Writer' : 'Student';
    return '<span class="role-badge ' + cls + '">' + label + '</span>';
}

async function loadVersions() {
    if (!sb || !PAPER_ID) return;
    try {
        var res = await sb.from('paper_versions')
            .select('*')
            .eq('paper_id', PAPER_ID)
            .order('created_at', {
                ascending: false
            })
            .limit(80);
        if (res.error) throw res.error;
        _versions = res.data || [];
        renderVersions();
    } catch (e) {
        var list = document.getElementById('histList');
        if (list) list.innerHTML = '<div class="hist-empty">History did not load: ' + e.message + '</div>';
    }
}

function renderVersions() {
    var list = document.getElementById('histList');
    if (!list) return;
    if (!_versions.length) {
        list.innerHTML = '<div class="hist-empty">No saved version yet. Edit and press "Save" — every checkpoint will appear here.</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < _versions.length; i++) {
        var v = _versions[i];
        var isLatest = (i === 0);
        html += '<div class="hist-item">';
        html += '<div class="hist-top">';
        html += '<span class="hist-when">' + fmtWhen(v.created_at) + (isLatest ? ' · <em>latest</em>' : '') + '</span>';
        html += '<span class="hist-words">' + (v.word_count || 0) + ' words</span>';
        html += '</div>';
        html += '<div class="hist-who">' + roleBadge(v.editor_role) + ' ' + escapeHtml(v.editor_name || 'Unknown') + '</div>';
        if (v.change_note) html += '<div class="hist-note">' + escapeHtml(v.change_note) + '</div>';
        html += '<div class="hist-actions">';
        html += '<button onclick="previewVersion(\'' + v.id + '\')">Preview</button>';
        html += '<button class="restore" onclick="restoreVersion(\'' + v.id + '\')">Restore</button>';
        html += '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
}

function openHistory() {
    document.getElementById('histOverlay').classList.add('show');
    loadVersions();
}

function closeHistory() {
    document.getElementById('histOverlay').classList.remove('show');
}

function closeHistoryBg(e) {
    if (e.target && e.target.id === 'histOverlay') closeHistory();
}

function findVersion(id) {
    for (var i = 0; i < _versions.length; i++)
        if (_versions[i].id === id) return _versions[i];
    return null;
}

/* ═══════════════════════════════════════════════════════════════
   ⭐ DIFF (Google-Docs jaisा "kya change hua")
   - deleted word  → background RED + strikethrough
   - added word    → background GREEN
   Plain text par word-level diff (LCS). Bahut bade doc par
   line-level fallback (taaki browser slow na ho).
═══════════════════════════════════════════════════════════════ */
var DIFF_DEL_STYLE = 'background:#ffd6d6;color:#a4242b;text-decoration:line-through;border-radius:2px;padding:0 1px;';
var DIFF_INS_STYLE = 'background:#caf5d6;color:#1c6b3a;text-decoration:none;border-radius:2px;padding:0 1px;';

/* HTML → readable plain text (block tags ko newline bana ke) */
function htmlToText(html) {
    var s = html || '';
    s = s.replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    var d = document.createElement('div');
    d.innerHTML = s;
    var txt = d.textContent || d.innerText || '';
    return txt.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

/* generic LCS diff: do arrays → ops list {t:'eq'|'del'|'ins', v:token} */
function lcsDiff(a, b) {
    var n = a.length,
        m = b.length;
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
    for (var i = n - 1; i >= 0; i--) {
        var dpi = dp[i],
            dpi1 = dp[i + 1];
        for (var j = m - 1; j >= 0; j--) {
            if (a[i] === b[j]) dpi[j] = dpi1[j + 1] + 1;
            else dpi[j] = dpi1[j] >= dpi[j + 1] ? dpi1[j] : dpi[j + 1];
        }
    }
    var ops = [],
        i = 0,
        j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            ops.push({
                t: 'eq',
                v: a[i]
            });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({
                t: 'del',
                v: a[i]
            });
            i++;
        } else {
            ops.push({
                t: 'ins',
                v: b[j]
            });
            j++;
        }
    }
    while (i < n) {
        ops.push({
            t: 'del',
            v: a[i]
        });
        i++;
    }
    while (j < m) {
        ops.push({
            t: 'ins',
            v: b[j]
        });
        j++;
    }
    return ops;
}

/* ek token ko render karo (eq = normal, del = red, ins = green; whitespace highlight nahi) */
function renderTok(t, v) {
    if (t === 'eq') return escapeHtml(v);
    if (/^\s+$/.test(v)) return escapeHtml(v);
    if (t === 'del') return '<del style="' + DIFF_DEL_STYLE + '">' + escapeHtml(v) + '</del>';
    return '<ins style="' + DIFF_INS_STYLE + '">' + escapeHtml(v) + '</ins>';
}

/* sirf ek BADLE HUE block (chhota) par word-by-word diff */
/* Word-level diff jo sirf BADLE HUE words highlight karta hai.
   Trick: pehle common PREFIX (jo shuru me same hai) aur common SUFFIX
   (jo aakhir me same hai) ko hata do — wo plain dikhega. Sirf beech ka
   chhota changed hissa LCS se diff hota hai. Isliye 3600-word paper me
   bhi agar 3-4 word badle to sirf wahi red/green honge, baaki sab normal.
   Aur ye fast hai kyunki LCS sirf chhote middle par chalta hai. */
function diffWordsInline(oldText, newText) {
    if (oldText === newText) return escapeHtml(oldText);
    if (!oldText) return '<ins style="' + DIFF_INS_STYLE + '">' + escapeHtml(newText) + '</ins>';
    if (!newText) return '<del style="' + DIFF_DEL_STYLE + '">' + escapeHtml(oldText) + '</del>';

    var a = oldText.match(/\S+|\s+/g) || [];
    var b = newText.match(/\S+|\s+/g) || [];
    var n = a.length,
        m = b.length;

    // common prefix
    var s = 0;
    while (s < n && s < m && a[s] === b[s]) s++;
    // common suffix
    var ea = n,
        eb = m;
    while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
        ea--;
        eb--;
    }

    var out = '';
    for (var p = 0; p < s; p++) out += escapeHtml(a[p]); // prefix = plain

    var midA = a.slice(s, ea),
        midB = b.slice(s, eb); // sirf changed middle
    if (midA.length * midB.length > 6000000) {
        // bahut bada scattered change — middle ko seedha del+ins (rare)
        if (midA.length) out += '<del style="' + DIFF_DEL_STYLE + '">' + escapeHtml(midA.join('')) + '</del>';
        if (midB.length) out += '<ins style="' + DIFF_INS_STYLE + '">' + escapeHtml(midB.join('')) + '</ins>';
    } else {
        var ops = lcsDiff(midA, midB);
        for (var k = 0; k < ops.length; k++) out += renderTok(ops[k].t, ops[k].v);
    }

    for (var q = ea; q < n; q++) out += escapeHtml(a[q]); // suffix = plain
    return out;
}

/* MAIN: dono versions ka plain text nikaal ke word-diff. */
function buildDiffHtml(oldHtml, newHtml) {
    return diffWordsInline(htmlToText(oldHtml), htmlToText(newHtml));
}

var _previewVer = null;

function previewVersion(id) {
    var v = findVersion(id);
    if (!v) return;
    _previewVer = v;
    document.getElementById('previewMeta').innerHTML =
        roleBadge(v.editor_role) + ' ' + escapeHtml(v.editor_name || 'Unknown') + ' · ' + fmtWhen(v.created_at);
    document.getElementById('previewTitle').textContent = v.title || 'Untitled';

    /* is version se theek pehle wala (purana) version dhoondo.
       _versions list newest→oldest hai, isliye agla index = purana version. */
    var idx = -1;
    for (var i = 0; i < _versions.length; i++) {
        if (_versions[i].id === v.id) {
            idx = i;
            break;
        }
    }
    var older = (idx >= 0 && idx < _versions.length - 1) ? _versions[idx + 1] : null;

    var body = document.getElementById('previewBody');
    var legend = '<div style="font-family:var(--mono);font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:.9rem;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;">' +
        '<span style="' + DIFF_INS_STYLE + '">added</span>' +
        '<span style="' + DIFF_DEL_STYLE + '">deleted</span>';

    if (older) {
        legend += '<span style="text-transform:none;letter-spacing:0;">vs ' + fmtWhen(older.created_at) + '</span></div>';
        body.innerHTML = legend +
            '<div style="white-space:pre-wrap;word-break:break-word;">' + buildDiffHtml(older.content || '', v.content || '') + '</div>';
    } else {
        /* sabse purana version — compare karne ko kuch nahi (sab kuch naya hai) */
        legend += '<span style="text-transform:none;letter-spacing:0;">first version</span></div>';
        body.innerHTML = legend +
            '<div style="white-space:pre-wrap;word-break:break-word;">' +
            buildDiffHtml('', v.content || '') + '</div>';
    }
    document.getElementById('previewOverlay').classList.add('show');
}

function closePreview() {
    document.getElementById('previewOverlay').classList.remove('show');
    _previewVer = null;
}

function restoreFromPreview() {
    if (_previewVer) restoreVersion(_previewVer.id);
}

async function restoreVersion(id) {
    var v = findVersion(id);
    if (!v) return;
    if (!confirm('Restore this version?\n\n' + (v.editor_name || '') + ' · ' + fmtWhen(v.created_at) +
            '\n\nThe current content will be saved to a new checkpoint, and then the old version will be loaded.')) return;

    // pehle current ko ek checkpoint bana lo (taaki ye bhi history me safe rahe)
    await doSave(true, 'Auto-checkpoint before restore');

    // ab purana version editor me daalo
    if (quill) quill.root.innerHTML = v.content || '';
    document.getElementById('docTitle').value = v.title || '';
    document.getElementById('docAbstract').value = v.abstract || '';
    document.getElementById('docTrack').value = v.track || 'research';
    updateCounts();
    _lastVersionContent = ''; // force snapshot
    _lastVersionTime = 0;

    // restored version ko save + naya checkpoint
    await doSave(true, 'Restored from ' + fmtWhen(v.created_at));
    closePreview();
    closeHistory();
    toast('Version restored ✓', 'success');
}

/* ─── DOWNLOAD DROPDOWN ─── */
/* ─── DOWNLOAD DROPDOWN ─── */
function toggleDownload(e) {
    e.stopPropagation();
    var menu = document.getElementById('downloadMenu');
    if (!menu) return;
    menu.classList.toggle('show');
}
document.addEventListener('click', function () {
    var dm = document.getElementById('downloadMenu');
    if (dm) dm.classList.remove('show');
});

/* Page load par hi bata do agar koi download library fail hui */
window.addEventListener('load', function () {
    var missing = [];
    if (typeof html2pdf === 'undefined') missing.push('PDF (html2pdf)');
    if (typeof window.docx === 'undefined') missing.push('Word (docx)');
    if (typeof window.saveAs === 'undefined') missing.push('FileSaver');
    if (missing.length) {
        console.error('[Paper Editor] Download libraries missing:', missing.join(', '));
        toast(missing.join(', ') + ' load nahi hui — download kaam nahi karega. Console check karo.', 'error');
    }
});

function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPrintHtml() {
    var title = document.getElementById('docTitle').value || 'Untitled';
    var abstract = document.getElementById('docAbstract').value || '';
    var content = quill ? quill.root.innerHTML : '';
    var author = USER.full_name || 'Author';
    var date = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    var html = '';
    html += '<div style="font-family: Georgia, serif; padding: 40px; color: #1c3a2b;">';
    html += '<div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #8b2e2e; padding-bottom: 20px;">';
    html += '<div style="font-size: 11px; letter-spacing: 0.22em; color: #8b2e2e; text-transform: uppercase; margin-bottom: 10px;"> Peak Potentia &middot; 2026</div>';
    html += '<h1 style="font-size: 32px; font-weight: 500; margin: 0 0 10px 0; line-height: 1.2;">' + escapeHtml(title) + '</h1>';
    html += '<p style="font-size: 14px; color: #5a6b5e; margin: 0;">by ' + escapeHtml(author) + ' &middot; ' + date + '</p>';
    html += '</div>';
    if (abstract) {
        html += '<div style="font-style: italic; color: #5a6b5e; padding: 15px 20px; border-left: 3px solid #c9a05a; margin-bottom: 30px; font-size: 16px; line-height: 1.6;">';
        html += '<strong style="font-style: normal; color: #1c3a2b;">Abstract:</strong> ' + escapeHtml(abstract);
        html += '</div>';
    }
    html += '<div style="font-size: 15px; line-height: 1.8;">' + content + '</div></div>';
    return html;
}

function downloadPDF() {
    document.getElementById('downloadMenu').classList.remove('open');
    if (typeof html2pdf === 'undefined') {
        toast('PDF library not loaded', 'error');
        return;
    }
    var title = document.getElementById('docTitle').value || 'Untitled';
    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildPrintHtml();
    var opt = {
        margin: 15,
        filename: title.replace(/[^a-z0-9]/gi, '_') + '.pdf',
        image: {
            type: 'jpeg',
            quality: 0.98
        },
        html2canvas: {
            scale: 2,
            useCORS: true
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        }
    };
    toast('Generating PDF...', 'success');
    html2pdf().set(opt).from(wrapper).save()
        .then(function () {
            toast('PDF downloaded!', 'success');
        })
        .catch(function (e) {
            toast('PDF error: ' + e.message, 'error');
        });
}

async function downloadDOCX() {
    document.getElementById('downloadMenu').classList.remove('open');
    if (typeof window.docx === 'undefined') {
        toast('Word library not loaded', 'error');
        return;
    }
    if (typeof window.saveAs === 'undefined') {
        toast('FileSaver not loaded', 'error');
        return;
    }
    var title = document.getElementById('docTitle').value || 'Untitled';
    var abstract = document.getElementById('docAbstract').value || '';
    var author = USER.full_name || 'Author';
    try {
        var Document = window.docx.Document,
            Packer = window.docx.Packer,
            Paragraph = window.docx.Paragraph,
            TextRun = window.docx.TextRun,
            HeadingLevel = window.docx.HeadingLevel,
            AlignmentType = window.docx.AlignmentType;
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = quill ? quill.root.innerHTML : '';
        var paragraphs = [];
        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: title,
                bold: true,
                size: 36
            })],
            alignment: AlignmentType.CENTER,
            spacing: {
                after: 200
            }
        }));
        var dateStr = new Date().toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: 'by ' + author + '  -  ' + dateStr,
                italics: true,
                size: 22,
                color: '5a6b5e'
            })],
            alignment: AlignmentType.CENTER,
            spacing: {
                after: 400
            }
        }));
        if (abstract) paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: 'Abstract: ',
                bold: true,
                size: 24
            }), new TextRun({
                text: abstract,
                italics: true,
                size: 24,
                color: '5a6b5e'
            })],
            spacing: {
                after: 300
            }
        }));
        for (var i = 0; i < tempDiv.childNodes.length; i++) {
            var node = tempDiv.childNodes[i];
            if (node.nodeType !== 1) continue;
            var tag = node.tagName.toLowerCase();
            var text = node.textContent.trim();
            var hasImage = node.querySelector && node.querySelector('img');
            if (!text && !hasImage) continue;
            if (hasImage && !text) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({
                        text: '[Image]',
                        italics: true,
                        size: 20,
                        color: '8aa0b8'
                    })],
                    alignment: AlignmentType.CENTER,
                    spacing: {
                        after: 120
                    }
                }));
                continue;
            }
            if (tag === 'h1') paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: text,
                    bold: true,
                    size: 32
                })],
                heading: HeadingLevel.HEADING_1,
                spacing: {
                    before: 240,
                    after: 120
                }
            }));
            else if (tag === 'h2') paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: text,
                    bold: true,
                    size: 28
                })],
                heading: HeadingLevel.HEADING_2,
                spacing: {
                    before: 200,
                    after: 100
                }
            }));
            else if (tag === 'h3') paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: text,
                    bold: true,
                    size: 26
                })],
                heading: HeadingLevel.HEADING_3,
                spacing: {
                    before: 180,
                    after: 100
                }
            }));
            else if (tag === 'ul' || tag === 'ol') {
                var items = node.querySelectorAll('li');
                for (var j = 0; j < items.length; j++) paragraphs.push(new Paragraph({
                    children: [new TextRun({
                        text: '• ' + items[j].textContent.trim(),
                        size: 22
                    })],
                    spacing: {
                        after: 60
                    }
                }));
            } else if (tag === 'blockquote') paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: text,
                    italics: true,
                    size: 22,
                    color: '5a6b5e'
                })],
                indent: {
                    left: 720
                },
                spacing: {
                    after: 120
                }
            }));
            else paragraphs.push(new Paragraph({
                children: [new TextRun({
                    text: text,
                    size: 22
                })],
                spacing: {
                    after: 120
                }
            }));
        }
        var doc = new Document({
            sections: [{
                children: paragraphs
            }]
        });
        var blob = await Packer.toBlob(doc);
        saveAs(blob, title.replace(/[^a-z0-9]/gi, '_') + '.docx');
        toast('Word file downloaded!', 'success');
    } catch (e) {
        toast('DOCX error: ' + e.message, 'error');
    }
}

function downloadHTML() {
    document.getElementById('downloadMenu').classList.remove('open');
    if (typeof window.saveAs === 'undefined') {
        toast('FileSaver not loaded', 'error');
        return;
    }
    var title = document.getElementById('docTitle').value || 'Untitled';
    var abstract = document.getElementById('docAbstract').value || '';
    var author = USER.full_name || 'Author';
    var date = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    var content = quill ? quill.root.innerHTML : '';
    var css = 'body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:20px;color:#1c3a2b;line-height:1.8}';
    css += 'h1{text-align:center;font-size:2.4rem}.meta{text-align:center;color:#5a6b5e;margin-bottom:40px;border-bottom:2px solid #8b2e2e;padding-bottom:20px}';
    css += '.abstract{font-style:italic;color:#5a6b5e;padding:15px 20px;border-left:3px solid #c9a05a;margin-bottom:30px}img{max-width:100%;height:auto;display:block;margin:1rem auto;border-radius:4px}';
    var doc = '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>' + escapeHtml(title) + '</title>\n<style>' + css + '</style></head>\n<body>\n';
    doc += '<div class="meta"><h1>' + escapeHtml(title) + '</h1><p>by ' + escapeHtml(author) + ' &middot; ' + date + '</p></div>\n';
    if (abstract) doc += '<div class="abstract"><strong>Abstract:</strong> ' + escapeHtml(abstract) + '</div>\n';
    doc += content + '\n</body></html>';
    var blob = new Blob([doc], {
        type: 'text/html'
    });
    saveAs(blob, title.replace(/[^a-z0-9]/gi, '_') + '.html');
    toast('HTML downloaded!', 'success');
}

if (sb && quill) loadPaper();
console.log('[Paper Editor] Setup complete');


/* ═══════════════════════════════════════════════════════════════
   ⭐ COMMENTS (har role ko dikhega — student, writer, admin, co_admin)
═══════════════════════════════════════════════════════════════ */
var COMMENTS_TABLE = 'paper_comments';
var _comments = [];

async function loadComments() {
    if (!sb || !PAPER_ID) return;
    try {
        var res = await sb.from(COMMENTS_TABLE)
            .select('*')
            .eq('paper_id', PAPER_ID)
            .order('created_at', { ascending: false });
        if (res.error) throw res.error;
        var all = res.data || [];
        _comments = filterCommentsForUser(all);
        renderComments();
    } catch (e) {
        var list = document.getElementById('cmtList');
        if (list) list.innerHTML = '<div class="cmt-empty">Comments did not load: ' + e.message + '</div>';
    }
}
function filterCommentsForUser(list) {
    if (USER.role === 'admin' || USER.role === 'co_admin') return list;

    var out = [];
    for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.user_id === USER.id) { out.push(c); continue; }
        if (!c.target_role) { out.push(c); continue; }
        if (c.target_role === USER.role) { out.push(c); continue; }
    }
    return out;
}

function roleBadgeCmt(role) {
    var cls = 'role-' + (role || 'student');
    var label = role === 'admin' ? 'Admin' :
        role === 'co_admin' ? 'Co-Admin' :
        role === 'writer' ? 'Writer' : 'Student';
    return '<span class="cmt-role ' + cls + '">' + label + '</span>';
}

function renderComments() {
    var list = document.getElementById('cmtList');
    if (!list) return;
    if (!_comments.length) {
        list.innerHTML = '<div class="cmt-empty">No comments yet. Be the first to comment.</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < _comments.length; i++) {
        var c = _comments[i];
        var clickable = !!c.anchor_text;
        html += '<div class="cmt-item" style="cursor:' + (clickable ? 'pointer' : 'default') + ';"' +
            (clickable ? (' onclick="jumpToComment(\'' + c.id + '\')"') : '') + '>';
        html += '<div class="cmt-item-top">';
        html += '<span>' + roleBadgeCmt(c.user_role) + '</span>' + '<span>' + escapeHtml(c.user_name || 'Unknown') + '</span>';
        if (c.target_role) {
            html += '<span style="color:#8b2e2e;font-weight:600;">&rarr; ' + capitalizeRole(c.target_role) + '</span>';
        }
        html += '<span>' + fmtWhen(c.created_at) + '</span>';
        html += '</div>';
        if (clickable) {
            html += '<div style="font-size:.72rem;background:#f5f0e6;border-left:3px solid #c9a05a;padding:5px 8px;margin:4px 0;border-radius:3px;color:#5a6b5e;">"' +
                escapeHtml(c.anchor_text.slice(0, 100)) +
                (c.anchor_text.length > 100 ? '…' : '') + '"</div>';
        }
        html += '<div class="cmt-item-text">' + escapeHtml(c.comment_text) + '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
}

function getTargetOptions(role) {
    if (role === 'admin' || role === 'co_admin') {
        return [{
                value: 'student',
                label: 'To: Student'
            },
            {
                value: 'writer',
                label: 'To: Writer'
            }
        ];
    }
    if (role === 'writer') {
        return [{
                value: 'student',
                label: 'To: Student'
            },
            {
                value: 'admin',
                label: 'To: Admin'
            }
        ];
    }
    // student
    return [{
            value: 'writer',
            label: 'To: Writer'
        },
        {
            value: 'admin',
            label: 'To: Admin'
        }
    ];
}

function populateTargetDropdown() {
    var sel = document.getElementById('cmtTarget');
    if (!sel) return;
    var opts = getTargetOptions(USER.role);
    var html = '';
    for (var i = 0; i < opts.length; i++) {
        html += '<option value="' + opts[i].value + '">' + opts[i].label + '</option>';
    }
    sel.innerHTML = html;
}

function capitalizeRole(r) {
    if (!r) return '';
    return r.charAt(0).toUpperCase() + r.slice(1);
}

async function postComment() {
    var input = document.getElementById('cmtInput');
    var targetSel = document.getElementById('cmtTarget');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    var targetRole = targetSel ? targetSel.value : null;
    try {
        var payload = {
            paper_id: PAPER_ID,
            user_id: USER.id,
            user_name: USER.full_name,
            user_role: USER.role,
            comment_text: text,
            target_role: targetRole
        };
        if (_pendingAnchor) {
            payload.anchor_index = _pendingAnchor.index;
            payload.anchor_length = _pendingAnchor.length;
            payload.anchor_text = _pendingAnchor.text;
        }
        var res = await sb.from(COMMENTS_TABLE).insert(payload);
        if (res.error) throw res.error;
        input.value = '';
        _pendingAnchor = null;
        showAnchorPreview();
        loadComments();
    } catch (e) {
        toast('Comment error: ' + e.message, 'error');
    }
}

function openComments() {
    document.getElementById('cmtOverlay').classList.add('show');
    populateTargetDropdown();
    loadComments();
    showAnchorPreview();
}

function closeComments() {
    document.getElementById('cmtOverlay').classList.remove('show');
}

function closeCommentsBg(e) {
    if (e.target && e.target.id === 'cmtOverlay') closeComments();
}

/* ═══════════════════════════════════════════════════════════════
   ⭐ SELECTION-ANCHORED COMMENTS
   Paragraph select karo → "💬 Comment" button dikhega → us par click
   karke comment likho. Comment list me quote dikhega, aur us comment
   par click karne se editor me wo section highlight ho jayega.
═══════════════════════════════════════════════════════════════ */
var _pendingAnchor = null; // { index, length, text }

var floatBtn = document.createElement('button');
floatBtn.id = 'floatCommentBtn';
floatBtn.textContent = '💬 Comment';
floatBtn.style.cssText = 'position:absolute;display:none;z-index:500;background:#1c3a2b;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:.8rem;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);';
document.body.appendChild(floatBtn);

if (quill) {
    quill.on('selection-change', function (range) {
        if (range && range.length > 0) {
            var bounds = quill.getBounds(range.index, range.length);
            var editorRect = quill.root.getBoundingClientRect();
            floatBtn.style.top = (window.scrollY + editorRect.top + bounds.top - 38) + 'px';
            floatBtn.style.left = (window.scrollX + editorRect.left + bounds.left) + 'px';
            floatBtn.style.display = 'block';
        } else {
            floatBtn.style.display = 'none';
        }
    });
}

/* mousedown (click nahi) — taaki editor blur hone se pehle hi selection capture ho jaye */
floatBtn.addEventListener('mousedown', function (e) {
    e.preventDefault();
    var range = quill.getSelection();
    if (!range || range.length === 0) return;
    var text = quill.getText(range.index, range.length).trim();
    _pendingAnchor = {
        index: range.index,
        length: range.length,
        text: text.slice(0, 200)
    };
    floatBtn.style.display = 'none';
    openComments();
});

function showAnchorPreview() {
    var box = document.getElementById('anchorPreviewBox');
    var inputRow = document.querySelector('.cmt-input-row');
    if (!box && inputRow && inputRow.parentNode) {
        box = document.createElement('div');
        box.id = 'anchorPreviewBox';
        box.style.cssText = 'font-size:.75rem;background:#f5f0e6;border-left:3px solid #c9a05a;padding:6px 9px;margin:0 1rem 8px 1rem;border-radius:4px;color:#5a6b5e;';
        inputRow.parentNode.insertBefore(box, inputRow); // row ke UPAR, andar nahi
    }
    if (!box) return;
    if (_pendingAnchor) {
        box.innerHTML = '<strong>Commenting on:</strong> "' +
            escapeHtml(_pendingAnchor.text.slice(0, 120)) +
            (_pendingAnchor.text.length > 120 ? '…' : '') +
            '" &nbsp;<a href="#" onclick="clearAnchor();return false;" style="color:#8b2e2e;">cancel</a>';
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
}

function clearAnchor() {
    _pendingAnchor = null;
    showAnchorPreview();
}

/* jab comment par click karo, uska section editor me highlight ho */
function jumpToComment(id) {
    var c = null;
    for (var i = 0; i < _comments.length; i++)
        if (_comments[i].id === id) {
            c = _comments[i];
            break;
        }
    if (!c || c.anchor_index == null || c.anchor_length == null || !quill) return;

    quill.setSelection(c.anchor_index, c.anchor_length, 'user');

    var bounds = quill.getBounds(c.anchor_index, c.anchor_length);
    var editorCard = document.querySelector('.editor-card');
    if (editorCard) {
        window.scrollTo({
            top: window.scrollY + editorCard.getBoundingClientRect().top + bounds.top - 150,
            behavior: 'smooth'
        });
    }

    /* 2 second ka yellow flash — sirf selection se kabhi kabhi kam noticeable lagta hai */
    try {
        quill.formatText(c.anchor_index, c.anchor_length, {
            background: '#fff3a3'
        }, 'silent');
        setTimeout(function () {
            quill.formatText(c.anchor_index, c.anchor_length, {
                background: false
            }, 'silent');
        }, 2000);
    } catch (e) {
        /* non-critical, background format skip ho gaya to bhi selection dikhega */ }
}