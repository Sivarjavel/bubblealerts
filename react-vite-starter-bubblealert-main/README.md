# React Vite Starter — BubbleAlert (UI only)

A frontend-only implementation of **BubbleAlert** (Developer Assist) built with React + Vite + Tailwind.

> Expected backend endpoints:
>
> - `POST /api/index` { corpus, index, chunk?, overlap? }
> - `POST /api/ask` { index, q, k?, model?, show? }
> - `GET /api/tasks/list`
> - `POST /api/tasks/{add|toggle|delete}`
> - `POST /api/upload` (multipart: file, target)
> - `POST /api/transcribe` (multipart: audio)

## Quick start
```bash
npm i
cp .env.example .env   # set VITE_API_BASE if different
npm run dev
```
Open http://localhost:5173

## Build
```bash
npm run build
npm run preview
```

## Notes
- Keep secrets server-side. The UI only talks to your backend set by `VITE_API_BASE`.
- Voice notes use MediaRecorder (WebM). Ensure your backend accepts `audio/webm`.
