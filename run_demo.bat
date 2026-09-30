@echo off
cd /d "%~dp0"
if not exist frontend\dist (
    echo Building frontend...
    cd frontend && call npm install && call npm run build && cd ..
)
cd backend
echo Starting AquaTrace AI on http://localhost:8000 ...
..\.venv\Scripts\python.exe -m uvicorn aquatrace.api:app --host 127.0.0.1 --port 8000
