"""Download pre-converted NLLB CT2 model (no torch conversion needed)."""
import os

from huggingface_hub import snapshot_download

repo = os.environ.get('MODEL_REPO', 'JustFrederik/nllb-200-distilled-600M-ct2-int8')
out = os.environ.get('MODEL_DIR', '/app/model')
snapshot_download(repo, local_dir=out)
print('Model ready at', out, 'from', repo)
