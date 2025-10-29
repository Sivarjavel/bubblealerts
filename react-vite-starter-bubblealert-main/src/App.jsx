import React, { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'listener-ai-sessions'
const STOPWORDS = new Set([
  'the','and','you','that','for','with','have','this','from','they','will','your','about','there','would','could','should','into','what','when','where','which','been','were','them','their','over','also','just','like','need','more','some','than','each','make','keep','take','very','much','onto','ourselves','ours','ourselves','hers','herself','himself','hers','does','done','doing'
])

function analyzeTranscript(text) {
  const clean = text.trim()
  if (!clean) {
    return {
      summary: '',
      tasks: [],
      tags: [],
      entities: [],
      wordCount: 0,
    }
  }

  const sentences = clean
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
  const summary = sentences.slice(0, 3).join(' ')

  const taskRegex = /(action item|follow up|todo|to-do|should|need to|let's|please|remember to|deadline|schedule|assign|plan to|we must)/i
  const tasks = sentences
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => taskRegex.test(sentence))
    .map(({ sentence, index }) => ({
      id: `${index}-${Math.random().toString(36).slice(2, 7)}`,
      text: sentence.trim(),
      done: false,
    }))

  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const counts = new Map()
  for (const word of words) {
    if (word.length < 4 || STOPWORDS.has(word)) continue
    counts.set(word, (counts.get(word) || 0) + 1)
  }

  const tags = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word)

  const entities = Array.from(
    new Set(
      clean
        .split(/\s+/)
        .filter((token) => /^[A-Z][a-zA-Z]{2,}$/.test(token) && !STOPWORDS.has(token.toLowerCase()))
    )
  ).slice(0, 8)

  return {
    summary,
    tasks,
    tags,
    entities,
    wordCount: words.length,
  }
}

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function App() {
  const [sessions, setSessions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [noteTitle, setNoteTitle] = useState('Untitled Session')
  const [status, setStatus] = useState('Ready to capture ideas.')
  const [isRecording, setIsRecording] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [lastDurationMs, setLastDurationMs] = useState(null)

  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const startedAtRef = useRef(null)

  const analysis = useMemo(() => analyzeTranscript(currentTranscript), [currentTranscript])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setSessions(parsed)
        if (parsed.length > 0) {
          setSelectedId(parsed[0].id)
        }
      } catch (error) {
        console.warn('Failed to load saved sessions', error)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  }, [sessions])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechSupported(false)
      setStatus('Speech recognition is not supported in this browser.')
      return
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedId && sessions.length) {
      setSelectedId(sessions[0].id)
    }
  }, [sessions, selectedId])

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions
    const term = search.trim().toLowerCase()
    return sessions.filter((session) => {
      return [
        session.title,
        session.summary,
        session.transcript,
        session.tags.join(' '),
        session.entities.join(' '),
      ]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term))
    })
  }, [sessions, search])

  const selectedSession = filteredSessions.find((session) => session.id === selectedId)

  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechSupported(false)
      setStatus('Speech recognition is not available in this browser.')
      return
    }

    if (isRecording) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    finalTranscriptRef.current = ''
    startedAtRef.current = Date.now()

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim()
        } else {
          interim = `${interim} ${transcript}`.trim()
        }
      }
      const combined = `${finalTranscriptRef.current} ${interim}`.trim()
      setCurrentTranscript(combined)
    }

    recognition.onerror = (event) => {
      setStatus(event.error === 'not-allowed' ? 'Microphone permission denied.' : `Error: ${event.error}`)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
      if (startedAtRef.current) {
        setLastDurationMs(Date.now() - startedAtRef.current)
      }
      setStatus('Recording ended.')
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setIsRecording(true)
      setStatus('Listening… Speak naturally and pause when you are done.')
    } catch (error) {
      setStatus(`Unable to start recording: ${error.message}`)
    }
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsRecording(false)
    if (startedAtRef.current) {
      setLastDurationMs(Date.now() - startedAtRef.current)
    }
    setStatus('Recording stopped. Review the transcript below.')
  }

  function resetDraft() {
    setCurrentTranscript('')
    setNoteTitle('Untitled Session')
    setLastDurationMs(null)
    finalTranscriptRef.current = ''
    setStatus('Draft cleared. Ready for a new capture.')
  }

  function saveSession() {
    const transcript = currentTranscript.trim()
    if (!transcript) {
      setStatus('Add some content before saving your note.')
      return
    }

    const { summary, tasks, tags, entities, wordCount } = analysis
    const newSession = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: noteTitle.trim() || 'Untitled Session',
      createdAt: new Date().toISOString(),
      transcript,
      summary,
      tasks,
      tags,
      entities,
      wordCount,
      durationMs: lastDurationMs,
    }

    setSessions((prev) => [newSession, ...prev])
    setSelectedId(newSession.id)
    resetDraft()
    setStatus('Session saved! Find it in your library on the right.')
  }

  function deleteSession(id) {
    setSessions((prev) => prev.filter((session) => session.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
    }
  }

  function toggleTask(sessionId, taskId) {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session
        return {
          ...session,
          tasks: session.tasks.map((task) =>
            task.id === taskId ? { ...task, done: !task.done } : task
          ),
        }
      })
    )
  }

  function updateSessionTitle(sessionId, nextTitle) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, title: nextTitle } : session
      )
    )
  }

  function handleExport(session) {
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${session.title.replace(/[^a-z0-9_-]+/gi, '_') || 'listener_ai_note'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleImportText(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setCurrentTranscript((prev) => (prev ? `${prev}\n\n${text}` : text))
      setStatus(`Imported ${file.name}`)
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function formatDate(isoString) {
    const date = new Date(isoString)
    return date.toLocaleString()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Listener AI</h1>
          <p>Your private companion for capturing conversations, structuring notes, and extracting follow-ups.</p>
        </div>
        <div className="status-area">
          <span className={`status-dot ${isRecording ? 'recording' : ''}`} />
          <span>{status}</span>
        </div>
      </header>

      <main className="layout">
        <section className="column">
          <div className="panel">
            <h2 className="section-title">Record or Import</h2>
            {!speechSupported && (
              <div className="warning">
                Speech recognition is unavailable in this browser. Paste or import text instead.
              </div>
            )}
            <label className="field">
              <span>Session title</span>
              <input
                type="text"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                placeholder="Brainstorm with the product team"
              />
            </label>

            <div className="button-row">
              <button
                type="button"
                className={`button primary ${isRecording ? 'danger' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
              <label className="button secondary file-input">
                Import text
                <input type="file" accept="text/plain" onChange={handleImportText} />
              </label>
              <button type="button" className="button" onClick={resetDraft}>
                Clear draft
              </button>
            </div>

            <label className="field">
              <span>Live transcript</span>
              <textarea
                value={currentTranscript}
                onChange={(event) => setCurrentTranscript(event.target.value)}
                placeholder="Speak or paste your meeting notes here…"
                rows={12}
              />
            </label>

            <div className="meta">
              <div>
                <strong>Words:</strong> {analysis.wordCount}
              </div>
              <div>
                <strong>Duration:</strong> {formatDuration(lastDurationMs)}
              </div>
            </div>

            <button type="button" className="button primary full" onClick={saveSession}>
              Save session
            </button>
          </div>

          <div className="panel">
            <h2 className="section-title">Instant insights</h2>
            {analysis.summary ? (
              <>
                <div className="summary">
                  <h3>Summary</h3>
                  <p>{analysis.summary}</p>
                </div>
                {analysis.tasks.length > 0 && (
                  <div className="tasks-preview">
                    <h3>Suggested action items</h3>
                    <ul>
                      {analysis.tasks.map((task) => (
                        <li key={task.id}>{task.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.tags.length > 0 && (
                  <div className="tags">
                    <h3>Keywords</h3>
                    <div className="tag-row">
                      {analysis.tags.map((tag) => (
                        <span key={tag} className="badge">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="empty-state">
                Start speaking or paste content to see automatic summaries, action items, and keywords.
              </p>
            )}
          </div>
        </section>

        <section className="column">
          <div className="panel">
            <h2 className="section-title">Library</h2>
            <label className="field">
              <span>Search notes</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Try "marketing strategy" or "follow up"'
              />
            </label>
            <div className="session-list">
              {filteredSessions.length === 0 ? (
                <p className="empty-state">No sessions yet. Save one to get started.</p>
              ) : (
                filteredSessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    className={`session-card ${session.id === selectedId ? 'active' : ''}`}
                    onClick={() => setSelectedId(session.id)}
                  >
                    <div className="session-card-header">
                      <h3>{session.title}</h3>
                      <time>{formatDate(session.createdAt)}</time>
                    </div>
                    <p className="session-preview">{session.summary || session.transcript.slice(0, 140)}…</p>
                    <div className="session-tags">
                      {session.tags.map((tag) => (
                        <span key={tag} className="badge">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            {selectedSession ? (
              <div className="session-detail">
                <div className="session-detail-header">
                  <input
                    type="text"
                    value={selectedSession.title}
                    onChange={(event) => updateSessionTitle(selectedSession.id, event.target.value)}
                  />
                  <div className="detail-actions">
                    <button type="button" className="button" onClick={() => handleExport(selectedSession)}>
                      Export JSON
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => deleteSession(selectedSession.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="detail-meta">
                  <span>Created: {formatDate(selectedSession.createdAt)}</span>
                  <span>Words: {selectedSession.wordCount}</span>
                  <span>Duration: {formatDuration(selectedSession.durationMs)}</span>
                  {selectedSession.entities.length > 0 && (
                    <span>Entities: {selectedSession.entities.join(', ')}</span>
                  )}
                </div>

                {selectedSession.summary && (
                  <div className="detail-section">
                    <h3>Summary</h3>
                    <p>{selectedSession.summary}</p>
                  </div>
                )}

                {selectedSession.tasks.length > 0 && (
                  <div className="detail-section">
                    <h3>Action items</h3>
                    <ul className="task-list">
                      {selectedSession.tasks.map((task) => (
                        <li key={task.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => toggleTask(selectedSession.id, task.id)}
                            />
                            <span className={task.done ? 'done' : ''}>{task.text}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="detail-section">
                  <h3>Transcript</h3>
                  <pre>{selectedSession.transcript}</pre>
                </div>
              </div>
            ) : (
              <p className="empty-state">Select a session to review its insights and transcript.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
