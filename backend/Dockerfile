FROM python:3.11-slim

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p uploads/expenses uploads/profiles

EXPOSE 8000

# Use gunicorn with uvicorn workers in production for multi-process scaling
CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]

