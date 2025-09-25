/* dentblog Blog module · ver11-fix
 * - Excel loader from GitHub raw (blogs.xlsx)
 * - Search (title/content/category/tags)
 * - TTS: reads CONTENT (Web Speech API), with play/pause/resume/stop
 * - New post (client-side) + export to XLSX
 */

(function(){
  const $ = (sel, el=document)=>el.querySelector(sel);
  const $$ = (sel, el=document)=>Array.from(el.querySelectorAll(sel));
  const statusEl = $("#status");
  const postsEl  = $("#posts");
  const countEl  = $("#count");
  const baseInput= $("#baseUrl");
  const searchEl = $("#search");
  const btnSaveBase = $("#btn-save-base");
  const btnTest  = $("#btn-test");
  const btnStatus= $("#btn-status");
  const btnExport= $("#btn-export");
  const btnNew   = $("#btn-new");

  // State
  let baseUrl = localStorage.getItem("dentblog.baseUrl") || "https://raw.githubusercontent.com/nihicheli/dentblog/main/";
  let posts = [];   // full list
  let filtered = []; // view list
  let currentUtter = null;
  let paused = false;

  // Init
  baseInput.value = baseUrl;
  btnSaveBase.addEventListener("click", ()=>{
    baseUrl = baseInput.value.trim();
    localStorage.setItem("dentblog.baseUrl", baseUrl);
    toast("baseUrl 저장됨");
  });
  btnTest.addEventListener("click", loadFromGitHub);
  btnStatus.addEventListener("click", showStatus);
  btnExport.addEventListener("click", exportBlogs);
  btnNew.addEventListener("click", openNewModal);
  searchEl.addEventListener("input", ()=>render(filter(searchEl.value)));

  // Bootstrap modal refs
  const newModal = new bootstrap.Modal(document.getElementById("newModal"));
  $("#np-save").addEventListener("click", saveNewPost);

  // Load immediately
  loadFromGitHub();

  function showStatus(){
    const info = [
      `baseUrl: ${baseUrl}`,
      `posts: ${posts.length}`,
      `speechSynthesis: ${!!window.speechSynthesis}`
    ].join(" | ");
    toast(info, 3000);
  }

  async function loadFromGitHub(){
    const url = baseUrl.replace(/\/+$/, "") + "/blogs.xlsx";
    status(`불러오는 중… ${url}`);
    try{
      const res = await fetch(url, {cache:"no-store"});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, {type:"array"});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {defval:""});
      posts = normalize(rows);
      render(posts);
      status(`불러옴: ${posts.length} posts (blogs.xlsx)`);
    }catch(e){
      console.error(e);
      status(`로드 실패: ${e.message}`);
    }
  }

  function normalize(rows){
    // expected columns: id, date, title, content, category, tags, cover_image
    return rows.map((r,i)=>{
      const tags = String(r.tags||r.tag||"").split(",").map(s=>s.trim()).filter(Boolean);
      return {
        id: String(r.id||i+1),
        date: String(r.date||""),
        title: String(r.title||r.Title||"").trim(),
        content: String(r.content||r.body||"").trim(),
        category: String(r.category||r.cat||"").trim(),
        tags,
        cover_image: String(r.cover_image||r.image||"").trim()
      };
    });
  }

  function makePostItem(p){
    const item = document.createElement("div");
    item.className = "list-group-item";

    const t = document.createElement("div");
    t.className = "post-title";
    t.textContent = p.title || "(제목 없음)";

    const meta = document.createElement("div");
    meta.className = "post-meta mb-2";
    const tagBadges = p.tags.map(tag=>`<span class="badge text-bg-secondary badge-tag">#${escapeHtml(tag)}</span>`).join(" ");
    meta.innerHTML = `${escapeHtml(p.date)} · ${escapeHtml(p.category)} ${tagBadges}`;

    const body = document.createElement("div");
    body.className = "post-content";
    body.textContent = p.content; // keep plain (MD viewer는 추후)

    const tts = document.createElement("div");
    tts.className = "tts-controls mt-2";
    tts.innerHTML = `
      <button class="btn btn-sm btn-outline-primary" data-act="play">▶ 재생</button>
      <button class="btn btn-sm btn-outline-secondary" data-act="pause">⏸ 일시정지</button>
      <button class="btn btn-sm btn-outline-secondary" data-act="resume">⏯ 재개</button>
      <button class="btn btn-sm btn-outline-danger" data-act="stop">⏹ 정지</button>
    `;

    if (p.cover_image){
      const img = document.createElement("img");
      img.src = p.cover_image;
      img.alt = "cover";
      img.className = "cover";
      item.appendChild(img);
    }

    item.appendChild(t);
    item.appendChild(meta);
    item.appendChild(body);
    item.appendChild(tts);

    tts.addEventListener("click", (e)=>{
      const btn = e.target.closest("button");
      if(!btn) return;
      const act = btn.dataset.act;
      if(act==="play") speak(body.textContent);
      if(act==="pause") pauseTTS();
      if(act==="resume") resumeTTS();
      if(act==="stop") stopTTS();
    });

    return item;
  }

  function render(list){
    filtered = list.slice();
    postsEl.innerHTML = "";
    if(filtered.length===0){
      postsEl.innerHTML = `<div class="list-group-item text-muted">검색 결과가 없습니다.</div>`;
    }else{
      filtered.forEach(p=>postsEl.appendChild(makePostItem(p)));
    }
    countEl.textContent = `${filtered.length} posts`;
  }

  function filter(q){
    q = (q||"").trim().toLowerCase();
    if(!q) return posts;
    return posts.filter(p=>{
      return (p.title.toLowerCase().includes(q) ||
              p.content.toLowerCase().includes(q) ||
              p.category.toLowerCase().includes(q) ||
              p.tags.join(" ").toLowerCase().includes(q));
    });
  }

  // TTS
  function speak(text){
    if(!("speechSynthesis" in window)){ toast("TTS 미지원 브라우저입니다."); return; }
    stopTTS();
    currentUtter = new SpeechSynthesisUtterance(text);
    currentUtter.lang = "ko-KR";
    currentUtter.rate = 1.0;
    currentUtter.pitch = 1.0;
    paused = false;
    window.speechSynthesis.speak(currentUtter);
  }
  function pauseTTS(){
    if(window.speechSynthesis.speaking && !paused){
      window.speechSynthesis.pause(); paused = true;
    }
  }
  function resumeTTS(){
    if(paused){ window.speechSynthesis.resume(); paused = false; }
  }
  function stopTTS(){
    if(window.speechSynthesis.speaking){
      window.speechSynthesis.cancel();
    }
    currentUtter = null; paused = false;
  }

  // New post + export
  function openNewModal(){
    $("#np-date").value   = new Date().toISOString().slice(0,10);
    $("#np-cat").value    = "";
    $("#np-tags").value   = "";
    $("#np-title").value  = "";
    $("#np-content").value= "";
    $("#np-image").value  = "";
    newModal.show();
  }
  function saveNewPost(){
    const p = {
      id: String(Date.now()),
      date: $("#np-date").value.trim(),
      category: $("#np-cat").value.trim(),
      tags: $("#np-tags").value.split(",").map(s=>s.trim()).filter(Boolean),
      title: $("#np-title").value.trim(),
      content: $("#np-content").value.trim(),
      cover_image: $("#np-image").value.trim()
    };
    posts.unshift(p);
    render(filter(searchEl.value));
    newModal.hide();
    toast("임시로 글이 추가되었습니다. '내보내기'로 blogs.xlsx를 갱신하세요.");
  }

  function exportBlogs(){
    // convert to worksheet
    const rows = posts.map(p=>({
      id: p.id,
      date: p.date,
      title: p.title,
      content: p.content,
      category: p.category,
      tags: p.tags.join(", "),
      cover_image: p.cover_image
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "blogs");
    const wbout = XLSX.write(wb, {bookType:"xlsx", type:"array"});
    const blob = new Blob([wbout], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "blogs.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("blogs.xlsx 저장 완료. 깃허브 레포에 덮어쓰세요.");
  }

  // helpers
  function status(msg){ statusEl.textContent = msg; }
  function toast(msg, ms=1800){
    status(msg);
    if(ms>0){ setTimeout(()=>status(""), ms); }
  }
  function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
})();
