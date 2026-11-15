/* Social Post Studio — frontend wired to the real Express backend.
 * POSTs to /api/generate; renders only the platforms the user checked.
 * Images/video/music are honest placeholders (CSS gradients) — the server
 * returns paste-ready media_prompts text instead of fake assets.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('generator-form');
  const postPrompt = document.getElementById('post-prompt');
  const postTone = document.getElementById('post-tone');
  const btnGenerate = document.getElementById('btn-generate');
  const mediaConsole = document.getElementById('media-console');
  const backendStatus = document.getElementById('backend-status');
  const notice = document.getElementById('generate-notice');
  const promptCounter = document.getElementById('prompt-counter');
  const modeBadge = document.getElementById('mode-badge');
  const mediaPromptsBox = document.getElementById('media-prompts');
  const hashtagRow = document.getElementById('hashtag-row');
  const hashtagList = document.getElementById('hashtag-list');

  const platformBoxes = {
    x: document.getElementById('chk-x'),
    linkedin: document.getElementById('chk-linkedin'),
    instagram: document.getElementById('chk-instagram'),
    tiktok: document.getElementById('chk-tiktok'),
  };

  // Preview tabs
  const tabs = document.querySelectorAll('.tab-btn');
  const mockups = document.querySelectorAll('.mockup-card');

  // Mockup text boxes
  const mockXText = document.getElementById('mock-x-text');
  const mockLiText = document.getElementById('mock-li-text');
  const mockIgText = document.getElementById('mock-ig-text');
  const tiktokDesc = document.getElementById('tiktok-desc');
  const tiktokCaptions = document.getElementById('tiktok-captions');
  const tiktokVideo = document.getElementById('tiktok-video');

  // Media containers (honest gradient placeholders, not generated images)
  const mockXMedia = document.getElementById('mock-x-media');
  const mockLiMedia = document.getElementById('mock-li-media');
  const mockIgMedia = document.getElementById('mock-ig-media');

  const counters = {
    x: document.getElementById('counter-x'),
    linkedin: document.getElementById('counter-linkedin'),
    instagram: document.getElementById('counter-instagram'),
    tiktok: document.getElementById('counter-tiktok'),
  };

  let lastResult = null;
  let videoInterval = null;

  const showNotice = (msg, isError) => {
    notice.textContent = msg;
    notice.classList.remove('hidden', 'error');
    if (isError) notice.classList.add('error');
  };
  const hideNotice = () => notice.classList.add('hidden');

  const setCounter = (el, text, limit) => {
    if (!el) return;
    const n = (text || '').length;
    el.textContent = limit ? `${n} / ${limit}` : `${n} chars`;
    el.classList.toggle('over', Boolean(limit) && n > limit);
  };

  // Prompt char counter (server limit: 2000)
  postPrompt.addEventListener('input', () => {
    const n = postPrompt.value.length;
    promptCounter.textContent = `${n} / 2000`;
    promptCounter.classList.toggle('over', n > 2000);
  });

  // Toggle previews
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const platform = tab.dataset.platform;
      mockups.forEach((m) => m.classList.remove('active'));
      const map = { x: 'mock-x', linkedin: 'mock-linkedin', instagram: 'mock-instagram', tiktok: 'mock-tiktok' };
      if (map[platform]) document.getElementById(map[platform]).classList.add('active');
    });
  });

  // Backend health check: remove prototype banner only when backend is real.
  fetch('/api/health')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((h) => {
      backendStatus.textContent = h.ai
        ? 'Backend connected — AI captions (Gemini).'
        : 'Backend connected — template mode (no GEMINI_API_KEY on server).';
      backendStatus.classList.add('ok');
      const banner = document.getElementById('prototype-banner');
      if (banner) banner.remove();
    })
    .catch(() => {
      backendStatus.textContent = 'Backend unreachable — run `npm start` in this folder, then retry.';
      backendStatus.classList.add('err');
    });

  const selectedPlatforms = () => Object.keys(platformBoxes).filter((p) => platformBoxes[p] && platformBoxes[p].checked);

  const PLACEHOLDER = 'linear-gradient(135deg, #374151, #111827)';
  const GRADIENTS = {
    x: 'linear-gradient(135deg, #b72818, #1d3ecf)',
    linkedin: 'linear-gradient(135deg, #1e3a8a, #0d9488)',
    instagram: 'linear-gradient(135deg, #e6af00, #b72818)',
  };

  function renderPlaceholders(platforms) {
    const label = (name) => `<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;color:#fff;font-size:0.7rem;font-weight:600;">`
      + `<span>${name}</span><span style="font-weight:400;opacity:0.8;">Placeholder — no image generated</span></div>`;
    mockXMedia.innerHTML = platforms.includes('x')
      ? `<div style="width:100%;height:100%;background:${GRADIENTS.x};">${label('Void Studio')}</div>`
      : `<div style="width:100%;height:100%;background:${PLACEHOLDER};">${label('Not selected')}</div>`;
    mockLiMedia.innerHTML = platforms.includes('linkedin')
      ? `<div style="width:100%;height:100%;background:${GRADIENTS.linkedin};">${label('Void Enterprise')}</div>`
      : `<div style="width:100%;height:100%;background:${PLACEHOLDER};">${label('Not selected')}</div>`;
    mockIgMedia.innerHTML = platforms.includes('instagram')
      ? `<div style="width:100%;height:100%;background:${GRADIENTS.instagram};">${label('VOID RENDER')}</div>`
      : `<div style="width:100%;height:100%;background:${PLACEHOLDER};">${label('Not selected')}</div>`;
  }

  function renderCopies(data, platforms) {
    const { copies } = data;
    const notSelected = 'Not selected — tick the platform checkbox and regenerate.';

    if (platforms.includes('x') && typeof copies.x === 'string') {
      mockXText.textContent = copies.x;
      setCounter(counters.x, copies.x, 280);
    } else {
      mockXText.textContent = notSelected;
      setCounter(counters.x, '', 280);
    }

    if (platforms.includes('linkedin') && typeof copies.linkedin === 'string') {
      mockLiText.textContent = copies.linkedin;
      setCounter(counters.linkedin, copies.linkedin, 0);
    } else {
      mockLiText.textContent = notSelected;
      setCounter(counters.linkedin, '', 0);
    }

    if (platforms.includes('instagram') && typeof copies.instagram === 'string') {
      mockIgText.textContent = copies.instagram;
      setCounter(counters.instagram, copies.instagram, 0);
    } else {
      mockIgText.textContent = notSelected;
      setCounter(counters.instagram, '', 0);
    }

    if (videoInterval) clearInterval(videoInterval);
    if (platforms.includes('tiktok') && Array.isArray(copies.tiktok) && copies.tiktok.length) {
      const slides = copies.tiktok;
      tiktokDesc.textContent = `${slides[0].substring(0, 100)}${slides[0].length > 100 ? '...' : ''} #fyp`;
      setCounter(counters.tiktok, slides.join('\n'), 0);
      const bgs = [
        'linear-gradient(180deg, #e6af00, #1d3ecf)',
        'linear-gradient(180deg, #1d3ecf, #3b82f6)',
        'linear-gradient(180deg, #3b82f6, #d7f7e1)',
      ];
      let idx = 0;
      tiktokVideo.style.background = bgs[0];
      tiktokCaptions.textContent = slides[0];
      videoInterval = setInterval(() => {
        idx = (idx + 1) % slides.length;
        tiktokCaptions.textContent = slides[idx];
        tiktokVideo.style.background = bgs[idx % bgs.length];
      }, 2500);
    } else {
      tiktokDesc.textContent = notSelected;
      tiktokCaptions.textContent = 'No TikTok script — platform not selected.';
      tiktokVideo.style.background = PLACEHOLDER;
      setCounter(counters.tiktok, '', 0);
    }
  }

  function renderConsole(data) {
    mediaConsole.classList.remove('hidden');
    modeBadge.textContent = data.ai ? 'AI' : 'Template';
    modeBadge.className = `badge ${data.ai ? 'badge-success' : 'badge-warn'}`;

    mediaPromptsBox.innerHTML = '';
    const mp = data.media_prompts || {};
    for (const [platform, text] of Object.entries(mp)) {
      const row = document.createElement('div');
      row.className = 'media-prompt-row';
      const label = document.createElement('strong');
      label.textContent = `Image prompt (${platform}): `;
      const span = document.createElement('span');
      span.textContent = text;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-small';
      btn.textContent = 'Copy';
      btn.style.marginLeft = '0.5rem';
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied!'; }
        catch { btn.textContent = 'Copy failed'; }
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
      row.append(label, span, btn);
      mediaPromptsBox.appendChild(row);
    }

    if (Array.isArray(data.hashtags) && data.hashtags.length) {
      hashtagRow.classList.remove('hidden');
      hashtagList.textContent = data.hashtags.join(' ');
    } else {
      hashtagRow.classList.add('hidden');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideNotice();

    const prompt = postPrompt.value.trim();
    if (!prompt) {
      showNotice('Please enter a campaign prompt before generating.', true);
      postPrompt.focus();
      return;
    }
    if (prompt.length > 2000) {
      showNotice(`Prompt is ${prompt.length} characters — the server limit is 2000. Please shorten it.`, true);
      return;
    }
    const platforms = selectedPlatforms();
    if (!platforms.length) {
      showNotice('Select at least one target platform.', true);
      return;
    }
    const tone = postTone.value;

    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Generating…';

    try {
      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, tones: [tone], platforms }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        showNotice(data.error || `Request failed (HTTP ${r.status}).`, true);
        return;
      }
      lastResult = { ...data, prompt, tone };
      if (data.notice) showNotice(data.notice, false);
      renderPlaceholders(platforms);
      renderCopies(data, platforms);
      renderConsole(data);
      const firstTab = document.querySelector(`.preview-tabs .tab-btn[data-platform="${platforms[0]}"]`);
      if (firstTab) firstTab.click();
    } catch (err) {
      showNotice(`Could not reach the backend (${err.message}). Run \`npm start\` in this folder and retry.`, true);
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.textContent = 'Generate Post Assets';
    }
  });

  // --- Real download bundle (txt / md / json + clipboard + hashtags) ------
  const stamp = () => new Date().toISOString().slice(0, 10);

  function buildTxt(d) {
    const lines = [
      'SOCIAL POST STUDIO CAMPAIGN PACKAGE',
      `Date: ${stamp()}`,
      `Tone: ${d.tone}`,
      `Mode: ${d.ai ? 'AI (Gemini)' : 'Template (not AI)'}`,
      `Prompt: ${d.prompt}`,
      '',
    ];
    if (d.copies.x) lines.push('--- X (<=280 chars) ---', d.copies.x, '');
    if (d.copies.linkedin) lines.push('--- LINKEDIN ---', d.copies.linkedin, '');
    if (d.copies.instagram) lines.push('--- INSTAGRAM ---', d.copies.instagram, '');
    if (Array.isArray(d.copies.tiktok)) {
      lines.push('--- TIKTOK SLIDES ---');
      d.copies.tiktok.forEach((t, i) => lines.push(`Slide ${i + 1}: "${t}"`));
      lines.push('');
    }
    if (d.hashtags && d.hashtags.length) lines.push('--- HASHTAGS ---', d.hashtags.join(' '), '');
    if (d.media_prompts) {
      lines.push('--- IMAGE PROMPTS (paste into any image generator; no images rendered) ---');
      for (const [p, t] of Object.entries(d.media_prompts)) lines.push(`[${p}] ${t}`);
    }
    return lines.join('\n');
  }

  function buildMd(d) {
    const lines = [
      '# Social Post Studio — Campaign Package',
      '',
      `- Date: ${stamp()}`,
      `- Tone: ${d.tone}`,
      `- Mode: ${d.ai ? 'AI (Gemini)' : 'Template (not AI)'}`,
      `- Prompt: ${d.prompt}`,
      '',
    ];
    if (d.copies.x) lines.push('## X (<=280 chars)', '', d.copies.x, '');
    if (d.copies.linkedin) lines.push('## LinkedIn', '', d.copies.linkedin, '');
    if (d.copies.instagram) lines.push('## Instagram', '', d.copies.instagram, '');
    if (Array.isArray(d.copies.tiktok)) {
      lines.push('## TikTok slides', '');
      d.copies.tiktok.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
      lines.push('');
    }
    if (d.hashtags && d.hashtags.length) lines.push('## Hashtags', '', d.hashtags.join(' '), '');
    if (d.media_prompts) {
      lines.push('## Image prompts (paste into any image generator; no images rendered)', '');
      for (const [p, t] of Object.entries(d.media_prompts)) lines.push(`- **${p}**: ${t}`);
    }
    return lines.join('\n');
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const needResult = () => {
    if (!lastResult) { showNotice('Generate a campaign first — nothing to export yet.', true); return null; }
    return lastResult;
  };

  document.getElementById('btn-download-txt').addEventListener('click', () => {
    const d = needResult(); if (!d) return;
    download(`social_campaign_${stamp()}.txt`, buildTxt(d), 'text/plain');
  });
  document.getElementById('btn-download-md').addEventListener('click', () => {
    const d = needResult(); if (!d) return;
    download(`social_campaign_${stamp()}.md`, buildMd(d), 'text/markdown');
  });
  document.getElementById('btn-download-json').addEventListener('click', () => {
    const d = needResult(); if (!d) return;
    download(`social_campaign_${stamp()}.json`, JSON.stringify(d, null, 2), 'application/json');
  });
  document.getElementById('btn-copy-all').addEventListener('click', async (e) => {
    const d = needResult(); if (!d) return;
    try { await navigator.clipboard.writeText(buildTxt(d)); e.target.textContent = 'Copied!'; }
    catch { e.target.textContent = 'Copy failed'; }
    setTimeout(() => { e.target.textContent = 'Copy all to clipboard'; }, 1500);
  });
  document.getElementById('btn-copy-hashtags').addEventListener('click', async (e) => {
    const d = needResult(); if (!d || !d.hashtags) return;
    try { await navigator.clipboard.writeText(d.hashtags.join(' ')); e.target.textContent = 'Copied!'; }
    catch { e.target.textContent = 'Copy failed'; }
    setTimeout(() => { e.target.textContent = 'Copy hashtags'; }, 1500);
  });
});
