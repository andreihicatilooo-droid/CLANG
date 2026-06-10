FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    MODEL_REPO=JustFrederik/nllb-200-distilled-600M-ct2-int8 \
    MODEL_DIR=/app/model \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY prepare_model.py .
RUN python prepare_model.py

COPY lang_codes.py server.py ./

EXPOSE 8080
CMD ["python", "server.py"]
