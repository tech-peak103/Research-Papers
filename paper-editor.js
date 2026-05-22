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
   SESSION + PAPER ID + JUDGE MODE DETECTION
═══════════════════════════════════════════════════════════════ */
var USER = null;
try {
    var raw = sessionStorage.getItem('sc_user');
    if (raw) USER = JSON.parse(raw);
} catch (e) {}

if (!USER || !USER.id) {
    window.location.href = 'index.html';
}

var urlParams = new URLSearchParams(window.location.search);
var PAPER_ID = urlParams.get('id');
var IS_JUDGE_MODE = urlParams.get('judge') === '1';

if (!PAPER_ID) {
    window.location.href = 'student-dashboard.html';
}

/* ═══════════════════════════════════════════════════════════════
   🎯 BACK BUTTON FIX
   ───────────────────────────────────────────────────────────────
   Agar judge/admin mode hai (URL mein ?judge=1) toh
   back button judge-dashboard.html pe le jayega.
   Warna student-dashboard.html pe.
═══════════════════════════════════════════════════════════════ */
var BACK_URL = IS_JUDGE_MODE ? 'judge-dashboard.html' : 'student-dashboard.html';

// Update top bar ka back link
var backLink = document.getElementById('edBackLink');
if (backLink) {
    backLink.href = BACK_URL;
    console.log('[Paper Editor] Back URL set to: ' + BACK_URL);
}

// Judge mode badge dikhao
if (IS_JUDGE_MODE) {
    var badge = document.getElementById('judgeBadge');
    if (badge) badge.classList.add('show');
}

// Global function jo error overlay ke back button use karta hai
function goBackToDashboard() {
    window.location.href = BACK_URL;
}


var PAPER = null;
var _isLoading = true;
var _saveTimer = null;
var _lastSavedContent = '';
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
    _tt = setTimeout(function() { el.className = ''; }, 3000);
}

/* ═══════════════════════════════════════════════════════════════
   QUILL EDITOR — clean version (no broken third-party modules)
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
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'indent': '-1' }, { 'indent': '+1' }],
                        [{ 'align': [] }],
                        ['blockquote', 'code-block'],
                        ['link', 'image'],
                        ['clean']
                    ],
                    handlers: {
                        image: function() {
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

/* ─── IMAGE INSERT (file picker → base64 embed) ─── */
function insertImage(quillInstance) {
    var input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = function() {
        var file = input.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast('Image too large! Max 5MB allowed.', 'error');
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var range = quillInstance.getSelection(true);
            quillInstance.insertEmbed(range.index, 'image', e.target.result, 'user');
            quillInstance.setSelection(range.index + 1);
            toast('Image inserted! Click on it to resize.', 'success');
        };
        reader.onerror = function() {
            toast('Failed to read image', 'error');
        };
        reader.readAsDataURL(file);
    };
}

/* ═══════════════════════════════════════════════════════════════
   CUSTOM IMAGE RESIZE — click image, show toolbar, pick size
═══════════════════════════════════════════════════════════════ */
if (quill) {
    quill.root.addEventListener('click', function(e) {
        if (e.target && e.target.tagName === 'IMG') {
            selectImage(e.target);
        } else {
            deselectImage();
        }
    });

    document.addEventListener('click', function(e) {
        var toolbar = document.getElementById('imgResizeToolbar');
        var editor = quill.root;
        if (!editor.contains(e.target) && toolbar && !toolbar.contains(e.target)) {
            deselectImage();
        }
    });
}

function selectImage(img) {
    var prev = quill.root.querySelectorAll('img.selected-img');
    for (var i = 0; i < prev.length; i++) {
        prev[i].classList.remove('selected-img');
    }

    _selectedImg = img;
    img.classList.add('selected-img');

    var toolbar = document.getElementById('imgResizeToolbar');
    if (!toolbar) return;

    var editorRect = document.querySelector('.editor-card').getBoundingClientRect();
    var imgRect = img.getBoundingClientRect();

    var top = imgRect.top - editorRect.top - 45;
    var left = imgRect.left - editorRect.left;

    if (top < 5) {
        top = imgRect.bottom - editorRect.top + 8;
    }

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

    setTimeout(function() {
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
    var words = text ? text.split(/\s+/).filter(function(w){ return w.length; }).length : 0;
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
   Judge/admin mode mein student_id check skip karte hain
   (judge sab papers dekh aur edit kar sakta hai)
═══════════════════════════════════════════════════════════════ */
async function loadPaper() {
    if (!sb) {
        showCriticalError('Database not connected', 'Supabase client not initialized.');
        return;
    }

    try {
        var query = sb.from('papers').select('*').eq('id', PAPER_ID);
        if (!IS_JUDGE_MODE) {
            query = query.eq('student_id', USER.id);
        }

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
        updateCounts();

        if (PAPER.updated_at) {
            var d = new Date(PAPER.updated_at);
            document.getElementById('lastSavedTime').textContent =
                'Last saved: ' + d.toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        }

        _isLoading = false;
        setStatus('saved', 'All changes saved');

    } catch (e) {
        showCriticalError('Failed to load paper', e.message);
    }
}

/* ─── AUTO-SAVE ─── */
async function autoSave() {
    if (_isLoading || !PAPER || !sb || !quill) return;

    var title = document.getElementById('docTitle').value.trim() || 'Untitled Paper';
    var abstract = document.getElementById('docAbstract').value.trim();
    var track = document.getElementById('docTrack').value;
    var status = document.getElementById('docStatus').value;
    var content = quill.root.innerHTML;
    var words = updateCounts();

    setStatus('saving', 'Saving...');

    try {
        var result = await sb.from('papers').update({
            title: title,
            abstract: abstract,
            track: track,
            status: status,
            content: content,
            word_count: words,
            updated_at: new Date().toISOString()
        }).eq('id', PAPER_ID);

        if (result.error) throw result.error;

        _lastSavedContent = content;
        setStatus('saved', 'All changes saved');

        var now = new Date();
        document.getElementById('lastSavedTime').textContent =
            'Last saved: ' + now.toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit' });

    } catch (e) {
        setStatus('error', 'Save failed');
        toast('Save error: ' + e.message, 'error');
    }
}

function scheduleSave() {
    if (_isLoading) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(autoSave, 1500);
}

if (quill) {
    quill.on('text-change', function() {
        scheduleSave();
        updateCounts();
    });
}

['docTitle', 'docAbstract', 'docTrack', 'docStatus'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', scheduleSave);
        el.addEventListener('change', scheduleSave);
    }
});

function manualSave() {
    clearTimeout(_saveTimer);
    autoSave().then(function() { toast('Saved!', 'success'); });
}

window.addEventListener('beforeunload', function(e) {
    if (quill && quill.root.innerHTML !== _lastSavedContent) {
        autoSave();
        e.preventDefault();
        e.returnValue = '';
    }
});

/* ─── DOWNLOAD DROPDOWN ─── */
function toggleDownload(e) {
    e.stopPropagation();
    document.getElementById('downloadMenu').classList.toggle('open');
}
document.addEventListener('click', function() {
    var dm = document.getElementById('downloadMenu');
    if (dm) dm.classList.remove('open');
});

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildPrintHtml() {
    var title = document.getElementById('docTitle').value || 'Untitled';
    var abstract = document.getElementById('docAbstract').value || '';
    var content = quill ? quill.root.innerHTML : '';
    var author = USER.full_name || 'Author';
    var date = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

    var html = '';
    html += '<div style="font-family: Georgia, serif; padding: 40px; color: #1c3a2b;">';
    html += '<div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #8b2e2e; padding-bottom: 20px;">';
    html += '<div style="font-size: 11px; letter-spacing: 0.22em; color: #8b2e2e; text-transform: uppercase; margin-bottom: 10px;">Scholarly Compass &middot; 2026</div>';
    html += '<h1 style="font-size: 32px; font-weight: 500; margin: 0 0 10px 0; line-height: 1.2;">' + escapeHtml(title) + '</h1>';
    html += '<p style="font-size: 14px; color: #5a6b5e; margin: 0;">by ' + escapeHtml(author) + ' &middot; ' + date + '</p>';
    html += '</div>';

    if (abstract) {
        html += '<div style="font-style: italic; color: #5a6b5e; padding: 15px 20px; border-left: 3px solid #c9a05a; margin-bottom: 30px; font-size: 16px; line-height: 1.6;">';
        html += '<strong style="font-style: normal; color: #1c3a2b;">Abstract:</strong> ' + escapeHtml(abstract);
        html += '</div>';
    }

    html += '<div style="font-size: 15px; line-height: 1.8;">' + content + '</div>';
    html += '</div>';
    return html;
}

function downloadPDF() {
    document.getElementById('downloadMenu').classList.remove('open');
    if (typeof html2pdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }

    var title = document.getElementById('docTitle').value || 'Untitled';
    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildPrintHtml();

    var opt = {
        margin: 15,
        filename: title.replace(/[^a-z0-9]/gi, '_') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    toast('Generating PDF...', 'success');
    html2pdf().set(opt).from(wrapper).save()
        .then(function() { toast('PDF downloaded!', 'success'); })
        .catch(function(e) { toast('PDF error: ' + e.message, 'error'); });
}

async function downloadDOCX() {
    document.getElementById('downloadMenu').classList.remove('open');
    if (typeof window.docx === 'undefined') { toast('Word library not loaded', 'error'); return; }
    if (typeof window.saveAs === 'undefined') { toast('FileSaver not loaded', 'error'); return; }

    var title = document.getElementById('docTitle').value || 'Untitled';
    var abstract = document.getElementById('docAbstract').value || '';
    var author = USER.full_name || 'Author';

    try {
        var Document = window.docx.Document;
        var Packer = window.docx.Packer;
        var Paragraph = window.docx.Paragraph;
        var TextRun = window.docx.TextRun;
        var HeadingLevel = window.docx.HeadingLevel;
        var AlignmentType = window.docx.AlignmentType;

        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = quill ? quill.root.innerHTML : '';

        var paragraphs = [];

        paragraphs.push(new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 36 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));

        var dateStr = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
        paragraphs.push(new Paragraph({
            children: [new TextRun({
                text: 'by ' + author + '  -  ' + dateStr,
                italics: true, size: 22, color: '5a6b5e'
            })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        }));

        if (abstract) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Abstract: ', bold: true, size: 24 }),
                    new TextRun({ text: abstract, italics: true, size: 24, color: '5a6b5e' })
                ],
                spacing: { after: 300 }
            }));
        }

        for (var i = 0; i < tempDiv.childNodes.length; i++) {
            var node = tempDiv.childNodes[i];
            if (node.nodeType !== 1) continue;
            var tag = node.tagName.toLowerCase();
            var text = node.textContent.trim();
            var hasImage = node.querySelector && node.querySelector('img');
            if (!text && !hasImage) continue;

            if (hasImage && !text) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: '[Image]', italics: true, size: 20, color: '8aa0b8' })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 120 }
                }));
                continue;
            }

            if (tag === 'h1') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: text, bold: true, size: 32 })],
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 240, after: 120 }
                }));
            } else if (tag === 'h2') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: text, bold: true, size: 28 })],
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 }
                }));
            } else if (tag === 'h3') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: text, bold: true, size: 26 })],
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 180, after: 100 }
                }));
            } else if (tag === 'ul' || tag === 'ol') {
                var items = node.querySelectorAll('li');
                for (var j = 0; j < items.length; j++) {
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: '• ' + items[j].textContent.trim(), size: 22 })],
                        spacing: { after: 60 }
                    }));
                }
            } else if (tag === 'blockquote') {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: text, italics: true, size: 22, color: '5a6b5e' })],
                    indent: { left: 720 },
                    spacing: { after: 120 }
                }));
            } else {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: text, size: 22 })],
                    spacing: { after: 120 }
                }));
            }
        }

        var doc = new Document({ sections: [{ children: paragraphs }] });
        var blob = await Packer.toBlob(doc);
        saveAs(blob, title.replace(/[^a-z0-9]/gi, '_') + '.docx');
        toast('Word file downloaded!', 'success');

    } catch (e) {
        toast('DOCX error: ' + e.message, 'error');
    }
}

function downloadHTML() {
    document.getElementById('downloadMenu').classList.remove('open');
    if (typeof window.saveAs === 'undefined') { toast('FileSaver not loaded', 'error'); return; }

    var title = document.getElementById('docTitle').value || 'Untitled';
    var abstract = document.getElementById('docAbstract').value || '';
    var author = USER.full_name || 'Author';
    var date = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
    var content = quill ? quill.root.innerHTML : '';

    var css = 'body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:20px;color:#1c3a2b;line-height:1.8}';
    css += 'h1{text-align:center;font-size:2.4rem}';
    css += '.meta{text-align:center;color:#5a6b5e;margin-bottom:40px;border-bottom:2px solid #8b2e2e;padding-bottom:20px}';
    css += '.abstract{font-style:italic;color:#5a6b5e;padding:15px 20px;border-left:3px solid #c9a05a;margin-bottom:30px}';
    css += 'img{max-width:100%;height:auto;display:block;margin:1rem auto;border-radius:4px}';

    var doc = '<!DOCTYPE html>\n';
    doc += '<html><head><meta charset="UTF-8"><title>' + escapeHtml(title) + '</title>\n';
    doc += '<style>' + css + '</style></head>\n';
    doc += '<body>\n';
    doc += '<div class="meta"><h1>' + escapeHtml(title) + '</h1><p>by ' + escapeHtml(author) + ' &middot; ' + date + '</p></div>\n';

    if (abstract) {
        doc += '<div class="abstract"><strong>Abstract:</strong> ' + escapeHtml(abstract) + '</div>\n';
    }

    doc += content + '\n';
    doc += '</body></html>';

    var blob = new Blob([doc], { type: 'text/html' });
    saveAs(blob, title.replace(/[^a-z0-9]/gi, '_') + '.html');
    toast('HTML downloaded!', 'success');
}

if (sb && quill) {
    loadPaper();
}

console.log('[Paper Editor] Setup complete');