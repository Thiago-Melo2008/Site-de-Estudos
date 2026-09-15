import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  FileText,
  Youtube,
  X,
  Trash2,
  Paperclip,
  Upload,
  BookOpen,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase, FILES_BUCKET } from "./supabaseClient";

const SUBJECT_COLORS = ["#2F6B57", "#B0413E", "#3457A6", "#8C5E2A", "#6B4E8C", "#1F7A73"];

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?\s]+)/,
    /(?:youtube\.com\/embed\/)([^?\s]+)/,
    /(?:youtube\.com\/shorts\/)([^?\s]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function publicFileUrl(path) {
  const { data } = supabase.storage.from(FILES_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [items, setItems] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemType, setNewItemType] = useState("pdf");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemUrl, setNewItemUrl] = useState("");
  const [newItemFile, setNewItemFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewerItem, setViewerItem] = useState(null);
  const fileInputRef = useRef(null);

  // ---- load + realtime sync ----
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [{ data: subjData, error: subjErr }, { data: itemData, error: itemErr }] =
          await Promise.all([
            supabase.from("subjects").select("*").order("created_at", { ascending: true }),
            supabase.from("items").select("*").order("created_at", { ascending: true }),
          ]);
        if (subjErr) throw subjErr;
        if (itemErr) throw itemErr;
        if (!active) return;
        setSubjects(subjData ?? []);
        setItems(itemData ?? []);
        setActiveSubjectId((prev) => prev ?? subjData?.[0]?.id ?? null);
      } catch (e) {
        if (active) setError("Não foi possível carregar os dados. Confira a configuração do Supabase.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel("study-site-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // ---- subjects ----
  async function handleAddSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    const { data, error: err } = await supabase
      .from("subjects")
      .insert({ name, color })
      .select()
      .single();
    if (err) {
      setError("Não foi possível criar a matéria.");
      return;
    }
    setSubjects((prev) => [...prev, data]);
    setActiveSubjectId(data.id);
    setNewSubjectName("");
    setShowAddSubject(false);
  }

  async function handleDeleteSubject(id) {
    const filePaths = items
      .filter((i) => i.subject_id === id && i.type === "pdf" && i.file_path)
      .map((i) => i.file_path);

    const { error: err } = await supabase.from("subjects").delete().eq("id", id);
    if (err) {
      setError("Não foi possível excluir a matéria.");
      return;
    }
    if (filePaths.length > 0) {
      await supabase.storage.from(FILES_BUCKET).remove(filePaths);
    }
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setItems((prev) => prev.filter((i) => i.subject_id !== id));
    setActiveSubjectId((prev) => (prev === id ? null : prev));
  }

  // ---- items ----
  function resetItemForm() {
    setNewItemTitle("");
    setNewItemUrl("");
    setNewItemFile(null);
    setNewItemType("pdf");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAddItem() {
    if (!activeSubjectId) return;
    const title = newItemTitle.trim();
    if (!title) return;

    if (newItemType === "youtube") {
      const videoId = extractYouTubeId(newItemUrl.trim());
      if (!videoId) {
        setError("Esse link do YouTube não parece válido.");
        return;
      }
      const { data, error: err } = await supabase
        .from("items")
        .insert({ subject_id: activeSubjectId, type: "youtube", title, video_id: videoId })
        .select()
        .single();
      if (err) {
        setError("Não foi possível salvar o vídeo.");
        return;
      }
      setItems((prev) => [...prev, data]);
      setShowAddItem(false);
      resetItemForm();
      return;
    }

    if (newItemType === "pdf") {
      if (!newItemFile) {
        setError("Escolha um arquivo PDF.");
        return;
      }
      setSaving(true);
      try {
        const path = `${activeSubjectId}/${Date.now()}-${newItemFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from(FILES_BUCKET)
          .upload(path, newItemFile, { contentType: "application/pdf" });
        if (uploadErr) throw uploadErr;

        const { data, error: insertErr } = await supabase
          .from("items")
          .insert({ subject_id: activeSubjectId, type: "pdf", title, file_path: path })
          .select()
          .single();
        if (insertErr) throw insertErr;

        setItems((prev) => [...prev, data]);
        setShowAddItem(false);
        resetItemForm();
      } catch (e) {
        setError("Não foi possível salvar esse PDF.");
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleDeleteItem(item) {
    const { error: err } = await supabase.from("items").delete().eq("id", item.id);
    if (err) {
      setError("Não foi possível excluir esse material.");
      return;
    }
    if (item.type === "pdf" && item.file_path) {
      await supabase.storage.from(FILES_BUCKET).remove([item.file_path]);
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (viewerItem?.id === item.id) setViewerItem(null);
  }

  const activeSubject = subjects.find((s) => s.id === activeSubjectId) || null;
  const visibleItems = items.filter((i) => i.subject_id === activeSubjectId);

  return (
    <div className="study-root">
      <style>{`
        .study-root {
          --paper: #FBF9F3;
          --paper-line: #DCD5C1;
          --ink: #1F2A3D;
          --ink-soft: #5B6472;
          --highlight: #F2B705;
          --highlight-ink: #4A3800;
          --green: #2F6B57;
          --red: #B0413E;
          font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
          background: var(--paper);
          color: var(--ink);
          min-height: 100vh;
          width: 100%;
          display: flex;
          box-sizing: border-box;
        }
        .study-root * { box-sizing: border-box; }
        .study-root h1, .study-root h2, .study-root h3 {
          font-family: 'Source Serif 4', Georgia, serif;
          margin: 0;
          font-weight: 600;
        }
        .sidebar {
          width: 220px;
          flex-shrink: 0;
          background: #F2EEE1;
          border-right: 1px solid var(--paper-line);
          display: flex;
          flex-direction: column;
          padding: 20px 0;
          min-height: 100vh;
        }
        @media (max-width: 720px) {
          .study-root { flex-direction: column; }
          .sidebar {
            width: 100%;
            min-height: auto;
            flex-direction: row;
            overflow-x: auto;
            padding: 12px;
            gap: 8px;
            align-items: center;
          }
          .sidebar-header { display: none; }
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 18px 18px 18px;
          color: var(--ink);
        }
        .sidebar-header h1 { font-size: 17px; }
        .tab-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          overflow-y: auto;
        }
        @media (max-width: 720px) {
          .tab-list { flex-direction: row; flex: none; }
        }
        .tab {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 16px;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 14px;
          color: var(--ink);
          border-left: 3px solid transparent;
          white-space: nowrap;
          font-family: inherit;
        }
        .tab:hover { background: #E9E3D0; }
        .tab.active {
          background: var(--paper);
          border-left-color: var(--tab-color, var(--green));
          font-weight: 600;
        }
        .tab-dot {
          width: 9px; height: 9px; border-radius: 50%;
          background: var(--tab-color, var(--green));
          flex-shrink: 0;
        }
        .tab-name { overflow: hidden; text-overflow: ellipsis; }
        .add-subject-row { padding: 10px 16px; }
        .add-subject-btn {
          display: flex; align-items: center; gap: 6px;
          background: none; border: 1px dashed #B7AF98; color: var(--ink-soft);
          border-radius: 6px; padding: 8px 10px; cursor: pointer; font-size: 13px;
          font-family: inherit; width: 100%;
        }
        .add-subject-btn:hover { background: #E9E3D0; }
        .subject-form { padding: 8px 16px; display: flex; flex-direction: column; gap: 8px; }
        .text-input {
          font-family: inherit; font-size: 14px; padding: 8px 10px;
          border: 1px solid var(--paper-line); border-radius: 6px; background: white;
          color: var(--ink); width: 100%;
        }
        .text-input:focus { outline: 2px solid var(--green); outline-offset: 1px; }
        .form-actions { display: flex; gap: 8px; }
        .btn {
          font-family: inherit; font-size: 13px; padding: 7px 14px; border-radius: 6px;
          border: none; cursor: pointer; font-weight: 600;
        }
        .btn-primary { background: var(--highlight); color: var(--highlight-ink); }
        .btn-primary:hover { filter: brightness(0.96); }
        .btn-primary:disabled { opacity: 0.6; cursor: default; }
        .btn-ghost { background: transparent; color: var(--ink-soft); }
        .btn-ghost:hover { background: #E9E3D0; }
        .main {
          flex: 1;
          min-width: 0;
          background-image: repeating-linear-gradient(
            to bottom, transparent, transparent 35px, var(--paper-line) 36px
          );
          background-position: 0 78px;
          padding: 32px 40px 60px 40px;
          min-height: 100vh;
        }
        @media (max-width: 720px) { .main { padding: 20px; } }
        .main-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 28px; flex-wrap: wrap; gap: 14px;
        }
        .main-header h2 { font-size: 26px; display: flex; align-items: center; gap: 10px; }
        .subject-swatch { width: 12px; height: 12px; border-radius: 50%; }
        .item-count { color: var(--ink-soft); font-size: 13px; margin-top: 4px; }
        .btn-new-item {
          display: flex; align-items: center; gap: 6px;
          background: var(--ink); color: var(--paper); border: none;
          border-radius: 7px; padding: 10px 16px; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .btn-new-item:hover { background: #33445e; }
        .empty-state {
          border: 1px dashed #C9C1A9; border-radius: 10px; padding: 48px 24px;
          text-align: center; color: var(--ink-soft); max-width: 480px;
        }
        .empty-state h3 { color: var(--ink); font-size: 18px; margin-bottom: 8px; }
        .empty-state p { font-size: 14px; margin: 0; line-height: 1.5; }
        .card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 22px 18px;
        }
        .card {
          background: white;
          border: 1px solid #E7E1CE;
          border-radius: 4px;
          padding: 16px 16px 14px 16px;
          cursor: pointer;
          box-shadow: 0 1px 0 rgba(31,42,61,0.06), 0 6px 14px -10px rgba(31,42,61,0.25);
          position: relative;
          transform: rotate(var(--tilt, 0deg));
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .card:hover {
          transform: rotate(0deg) translateY(-2px);
          box-shadow: 0 2px 0 rgba(31,42,61,0.08), 0 10px 20px -10px rgba(31,42,61,0.3);
        }
        .card-icon-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .card-icon {
          width: 34px; height: 34px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          background: #F2EEE1; color: var(--ink);
        }
        .card-icon.pdf { color: var(--red); }
        .card-icon.youtube { color: var(--green); }
        .card-delete {
          background: none; border: none; color: #B7AF98; cursor: pointer;
          padding: 4px; border-radius: 4px; display: flex;
        }
        .card-delete:hover { color: var(--red); background: #F5E9E8; }
        .card-title { font-size: 14.5px; font-weight: 600; line-height: 1.35; color: var(--ink); }
        .card-meta { font-size: 12px; color: var(--ink-soft); margin-top: 6px; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(31,26,20,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; z-index: 50;
        }
        .modal {
          background: var(--paper); border-radius: 10px; padding: 24px;
          width: 100%; max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        }
        .modal h3 { font-size: 19px; margin-bottom: 16px; }
        .type-toggle { display: flex; gap: 8px; margin-bottom: 14px; }
        .type-btn {
          flex: 1; padding: 9px; border-radius: 7px; border: 1px solid var(--paper-line);
          background: white; cursor: pointer; font-family: inherit; font-size: 13px;
          display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--ink-soft);
        }
        .type-btn.active { border-color: var(--ink); color: var(--ink); background: #EFEADA; font-weight: 600; }
        .field-label { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 5px; display: block; }
        .field-group { margin-bottom: 14px; }
        .file-drop {
          border: 1px dashed #B7AF98; border-radius: 7px; padding: 16px;
          display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px; color: var(--ink-soft);
          background: white;
        }
        .file-drop:hover { background: #F2EEE1; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
        .viewer-overlay {
          position: fixed; inset: 0; background: rgba(20,17,12,0.75);
          display: flex; flex-direction: column; z-index: 60;
        }
        .viewer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; color: var(--paper);
        }
        .viewer-header h3 { color: var(--paper); font-size: 16px; }
        .viewer-close {
          background: rgba(255,255,255,0.12); border: none; color: white;
          width: 34px; height: 34px; border-radius: 50%; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .viewer-close:hover { background: rgba(255,255,255,0.22); }
        .viewer-body { flex: 1; padding: 0 20px 20px 20px; display: flex; }
        .viewer-frame { flex: 1; border: none; border-radius: 8px; background: white; width: 100%; }
        .toast-error {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: var(--red); color: white; padding: 11px 18px; border-radius: 8px;
          font-size: 13.5px; display: flex; align-items: center; gap: 8px; z-index: 80;
          box-shadow: 0 8px 20px rgba(0,0,0,0.25); max-width: 90vw;
        }
        .toast-error button { background: none; border: none; color: white; cursor: pointer; margin-left: 6px; opacity: 0.85; }
        .loading-screen {
          flex: 1; display: flex; align-items: center; justify-content: center;
          min-height: 100vh; color: var(--ink-soft); gap: 8px; font-size: 14px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {loading ? (
        <div className="loading-screen">
          <Loader2 size={18} className="spin" />
          Carregando seu material de estudo…
        </div>
      ) : (
        <>
          <aside className="sidebar">
            <div className="sidebar-header">
              <BookOpen size={20} />
              <h1>Estudos</h1>
            </div>

            <div className="tab-list">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  className={"tab" + (s.id === activeSubjectId ? " active" : "")}
                  style={{ "--tab-color": s.color }}
                  onClick={() => setActiveSubjectId(s.id)}
                >
                  <span className="tab-dot" />
                  <span className="tab-name">{s.name}</span>
                </button>
              ))}
            </div>

            <div className="add-subject-row">
              {showAddSubject ? (
                <div className="subject-form">
                  <input
                    className="text-input"
                    placeholder="Nome da matéria"
                    value={newSubjectName}
                    autoFocus
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
                  />
                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={handleAddSubject}>Criar</button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setShowAddSubject(false); setNewSubjectName(""); }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button className="add-subject-btn" onClick={() => setShowAddSubject(true)}>
                  <Plus size={15} /> Nova matéria
                </button>
              )}
            </div>
          </aside>

          <main className="main">
            {!activeSubject ? (
              <div className="empty-state">
                <h3>Comece criando uma matéria</h3>
                <p>Crie uma matéria na barra lateral — por exemplo "Cálculo I" ou "História" — e depois adicione PDFs e vídeos do YouTube dentro dela. Todo mundo com o link vai ver as mesmas matérias.</p>
              </div>
            ) : (
              <>
                <div className="main-header">
                  <div>
                    <h2>
                      <span className="subject-swatch" style={{ background: activeSubject.color }} />
                      {activeSubject.name}
                    </h2>
                    <div className="item-count">
                      {visibleItems.length === 0
                        ? "Nenhum material ainda"
                        : `${visibleItems.length} ${visibleItems.length === 1 ? "material" : "materiais"}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-new-item" onClick={() => setShowAddItem(true)}>
                      <Plus size={16} /> Novo material
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ border: "1px solid var(--paper-line)" }}
                      onClick={() => handleDeleteSubject(activeSubject.id)}
                    >
                      Excluir matéria
                    </button>
                  </div>
                </div>

                {visibleItems.length === 0 ? (
                  <div className="empty-state">
                    <h3>Nenhum material aqui ainda</h3>
                    <p>Adicione um PDF para ler ou um link do YouTube para assistir dentro desta matéria.</p>
                  </div>
                ) : (
                  <div className="card-grid">
                    {visibleItems.map((item, i) => (
                      <div
                        key={item.id}
                        className="card"
                        style={{ "--tilt": i % 2 === 0 ? "-0.6deg" : "0.6deg" }}
                        onClick={() => setViewerItem(item)}
                      >
                        <div className="card-icon-row">
                          <div className={"card-icon " + item.type}>
                            {item.type === "pdf" ? <Paperclip size={17} /> : <Youtube size={17} />}
                          </div>
                          <button
                            className="card-delete"
                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(item); }}
                            aria-label="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="card-title">{item.title}</div>
                        <div className="card-meta">{item.type === "pdf" ? "PDF" : "Vídeo do YouTube"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}

      {showAddItem && (
        <div className="modal-overlay" onClick={() => { setShowAddItem(false); resetItemForm(); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Novo material</h3>

            <div className="type-toggle">
              <button
                className={"type-btn" + (newItemType === "pdf" ? " active" : "")}
                onClick={() => setNewItemType("pdf")}
              >
                <FileText size={15} /> PDF
              </button>
              <button
                className={"type-btn" + (newItemType === "youtube" ? " active" : "")}
                onClick={() => setNewItemType("youtube")}
              >
                <Youtube size={15} /> Vídeo do YouTube
              </button>
            </div>

            <div className="field-group">
              <label className="field-label">Título</label>
              <input
                className="text-input"
                placeholder={newItemType === "pdf" ? "Ex: Lista de exercícios 3" : "Ex: Aula sobre integrais"}
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
              />
            </div>

            {newItemType === "pdf" ? (
              <div className="field-group">
                <label className="field-label">Arquivo PDF</label>
                <label className="file-drop">
                  <Upload size={16} />
                  {newItemFile ? newItemFile.name : "Escolher arquivo PDF"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => setNewItemFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            ) : (
              <div className="field-group">
                <label className="field-label">Link do YouTube</label>
                <input
                  className="text-input"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newItemUrl}
                  onChange={(e) => setNewItemUrl(e.target.value)}
                />
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setShowAddItem(false); resetItemForm(); }}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={handleAddItem}>
                {saving ? "Salvando…" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerItem && (
        <div className="viewer-overlay">
          <div className="viewer-header">
            <h3>{viewerItem.title}</h3>
            <button className="viewer-close" onClick={() => setViewerItem(null)}><X size={18} /></button>
          </div>
          <div className="viewer-body">
            {viewerItem.type === "youtube" ? (
              <iframe
                className="viewer-frame"
                src={`https://www.youtube.com/embed/${viewerItem.video_id}`}
                title={viewerItem.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <iframe
                className="viewer-frame"
                src={publicFileUrl(viewerItem.file_path)}
                title={viewerItem.title}
              />
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="toast-error">
          <AlertCircle size={15} />
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
