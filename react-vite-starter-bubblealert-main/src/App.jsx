import React, { useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:7070'

export default function App() {
  // Server + corpus/index config
  const [server, setServer] = useState(API_BASE)
  const [corpus, setCorpus] = useState('./my_corpus')
  const [indexPath, setIndexPath] = useState('./.index')

  // Index params
  const [chunk, setChunk] = useState(1200)
  const [overlap, setOverlap] = useState(150)

  // Ask panel
  const [question, setQuestion] = useState('Tell me about the event automation?')
  const [k, setK] = useState(8)
  const [model, setModel] = useState('gpt-4o-mini')
  const [answer, setAnswer] = useState('')
  const [hits, setHits] = useState([])
  const [showSnippets, setShowSnippets] = useState(false)

  // Tasks panel
  const [tasks, setTasks] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('High')
  const [newDue, setNewDue] = useState('')

  // File upload / voice record
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState('')
  const mediaRecorderRef = useRef(null)
  const [isRecording, setIsRecording] = useState(false)
  const chunksRef = useRef([])

  // --- helpers ---
  async function call(path, body, init={}) {
    try {
      const res = await fetch(`${server}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...init
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      return await res.json()
    } catch (e) {
      throw new Error(`Request failed: ${e.message}. Check backend (${server}).`)
    }
  }

  async function refreshTasks() {
    try {
      const res = await fetch(`${server}/api/tasks/list`)
      if (!res.ok) return
      const data = await res.json()
      setTasks(data?.tasks || [])
    } catch {}
  }
  useEffect(()=>{ refreshTasks() }, [server])

  // --- indexing ---
  async function doIndex() {
    setLoading(true); setLog('')
    try {
      const r = await call('/api/index', { corpus, index: indexPath, chunk, overlap })
      setLog(`Indexed ${r.indexedChunks} chunks from ${r.files} files in ${r.elapsedMs} ms`)
    } catch (e) { setLog(String(e)) }
    finally { setLoading(false) }
  }

  // --- ask ---
  async function doAsk() {
    setLoading(true); setAnswer(''); setHits([]); setLog('')
    try {
      const r = await call('/api/ask', { index: indexPath, q: question, k, model, show: showSnippets })
      setAnswer(r.answer); setHits(r.hits || []); if (r.debug) setLog(r.debug)
    } catch (e) { setLog(String(e)) }
    finally { setLoading(false) }
  }

  // --- tasks ---
  function priorityColor(p) { return p==='High' ? 'bg-red-500' : p==='Medium' ? 'bg-amber-500' : 'bg-emerald-500' }
  async function addTask() {
    if (!newTitle.trim()) return
    try {
      await call('/api/tasks/add', { title: newTitle.trim(), priority: newPriority, due: newDue || null })
      setNewTitle(''); setNewDue(''); setNewPriority('High')
      refreshTasks()
    } catch (e) { setLog(String(e)) }
  }
  async function toggleTask(id) { try { await call('/api/tasks/toggle', { id }); refreshTasks() } catch (e){ setLog(String(e)) } }
  async function delTask(id) { try { await call('/api/tasks/delete', { id }); refreshTasks() } catch (e){ setLog(String(e)) } }

  // --- file upload ---
  async function onUploadChange(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setLog('')
    const form = new FormData()
    form.append('file', file)
    form.append('target', corpus)
    try {
      const res = await fetch(`${server}/api/upload`, { method: 'POST', body: form })
      if (!res.ok) setLog(`Upload failed: ${await res.text()}`)
      else setLog(`Uploaded to corpus: ${file.name}`)
    } catch (e) { setLog(String(e)) }
    setUploading(false)
  }

  // --- voice ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = e => chunksRef.current.push(e.data)
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await sendForTranscription(blob)
        stream.getTracks().forEach(t => t.stop())
      }
      rec.start()
      mediaRecorderRef.current = rec
      setIsRecording(true)
    } catch (e) {
      setLog('Microphone permission denied or unsupported browser.')
    }
  }
  function stopRecording(){ mediaRecorderRef.current?.stop(); setIsRecording(false) }
  async function sendForTranscription(blob) {
    setLoading(true)
    try {
      const form = new FormData()
      form.append('audio', blob, `note-${Date.now()}.webm`)
      const res = await fetch(`${server}/api/transcribe`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setQuestion(q => (q ? q + '\n' : '') + data.text)
      setLog('Transcribed and appended to Ask box.')
    } catch (e) { setLog(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto grid gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">BubbleAlert — Developer Assist (UI)</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Backend:</span>
            <input className="px-2 py-1 rounded border" value={server} onChange={e=>setServer(e.target.value)} />
          </div>
        </header>

        {/* Tasks Panel */}
        <section className="grid gap-4 p-4 bg-white rounded-2xl shadow">
          <h2 className="font-semibold">Daily / Pending Tasks</h2>
          <div className="grid md:grid-cols-3 gap-3">
            <LabeledInput label="Task" value={newTitle} onChange={setNewTitle} placeholder="e.g., Fix login bug" />
            <label className="grid gap-1 text-sm">
              <span className="opacity-70">Priority</span>
              <select className="px-3 py-2 rounded-xl border" value={newPriority} onChange={e=>setNewPriority(e.target.value)}>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </label>
            <LabeledInput label="Due (YYYY-MM-DD)" value={newDue} onChange={setNewDue} placeholder="2025-10-15" />
          </div>
          <div className="flex gap-3">
            <button onClick={addTask} className="px-4 py-2 rounded-xl bg-black text-white">Add Task</button>
          </div>
          <ul className="grid gap-3 mt-3">
            {tasks.map(t => (
              <li key={t.id} className="flex items-center justify-between p-3 rounded-2xl border bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`inline-block w-3 h-3 rounded-full ${priorityColor(t.priority)}`}></span>
                  <span className={`font-medium ${t.done? 'line-through opacity-60':''}`}>{t.title}</span>
                  {t.due && <span className="text-xs opacity-70">(due {t.due})</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={()=>toggleTask(t.id)} className="px-3 py-1 rounded-xl border">{t.done? 'Mark Pending':'Mark Done'}</button>
                  <button onClick={()=>delTask(t.id)} className="px-3 py-1 rounded-xl border">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Corpus / Index Controls */}
        <section className="grid gap-4 p-4 bg-white rounded-2xl shadow">
          <h2 className="font-semibold">Corpus & Index</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <LabeledInput label="Corpus folder" value={corpus} onChange={setCorpus} />
            <LabeledInput label="Index folder" value={indexPath} onChange={setIndexPath} />
            <LabeledInput label="Chunk size" value={String(chunk)} onChange={v=>setChunk(parseInt(v||'0')||0)} />
            <LabeledInput label="Overlap" value={String(overlap)} onChange={v=>setOverlap(parseInt(v||'0')||0)} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={doIndex} disabled={loading} className="px-4 py-2 rounded-xl bg-black text-white">{loading? 'Indexing…':'Build / Rebuild Index'}</button>
            <label className="text-sm flex items-center gap-2">
              <input type="file" onChange={onUploadChange} disabled={uploading} />
              <span>Upload to corpus</span>
            </label>
          </div>
        </section>

        {/* Ask + Voice */}
        <section className="grid gap-4 p-4 bg-white rounded-2xl shadow">
          <h2 className="font-semibold">Ask with Context</h2>
          <LabeledInput label="Question" value={question} onChange={setQuestion} />
          <div className="grid md:grid-cols-3 gap-3">
            <LabeledInput label="Top-K" value={String(k)} onChange={v=>setK(parseInt(v||'0')||0)} />
            <LabeledInput label="Model" value={model} onChange={setModel} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showSnippets} onChange={(e)=>setShowSnippets(e.target.checked)} />
              Show retrieved snippets
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={doAsk} disabled={loading} className="px-4 py-2 rounded-xl bg-black text-white">{loading? 'Thinking…':'Ask'}</button>
            {!isRecording ? (
              <button onClick={startRecording} className="px-4 py-2 rounded-xl border">🎙️ Start Recording</button>
            ) : (
              <button onClick={stopRecording} className="px-4 py-2 rounded-xl border">⏹ Stop</button>
            )}
          </div>

          {answer && (
            <div className="grid gap-2">
              <h3 className="font-semibold">Answer</h3>
              <pre className="whitespace-pre-wrap text-sm leading-6">{answer}</pre>
            </div>
          )}
        </section>

        {hits.length>0 && (
          <section className="grid gap-3 p-4 bg-white rounded-2xl shadow">
            <h2 className="font-semibold">Citations / Hits</h2>
            <ul className="grid gap-2 text-sm">
              {hits.map((h, i)=> (
                <li key={i} className="p-2 rounded-xl bg-gray-50 border">
                  <div className="font-medium">[{h.source_id}] {h.title} {h.loc ?? ''}</div>
                  {showSnippets && <div className="mt-1 text-gray-700">{truncate(h.snippet, 900)}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {log && (
          <section className="grid gap-2 p-4 bg-white rounded-2xl shadow">
            <h2 className="font-semibold">Log</h2>
            <pre className="whitespace-pre-wrap text-xs text-gray-700">{log}</pre>
          </section>
        )}

        <footer className="text-xs opacity-60 text-center">BubbleAlert — {new Date().toLocaleString()}</footer>
      </div>
    </div>
  )
}

function LabeledInput({ label, value, onChange, placeholder }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="opacity-70">{label}</span>
      <input className="px-3 py-2 rounded-xl border outline-none focus:ring w-full" value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}
function truncate(s, n){ return (s?.length>n) ? s.slice(0, n) + '…' : s }
