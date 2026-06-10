"""Google OAuth flow for Gemini API (Generative Language) access."""
import os
import threading
import webbrowser
from . import config

# Public OAuth client for desktop apps — limited rate, but works without
# user-provided credentials.json. For production, replace with own client.
DEFAULT_CLIENT = {
    'installed': {
        'client_id':     '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com',
        'client_secret': 'd-FL95Q19q7MQmFpd7hHD0Ty',
        'auth_uri':      'https://accounts.google.com/o/oauth2/auth',
        'token_uri':     'https://oauth2.googleapis.com/token',
        'redirect_uris': ['http://localhost'],
    }
}

SCOPES = [
    'https://www.googleapis.com/auth/generative-language',
    'https://www.googleapis.com/auth/cloud-platform',
]


def run_oauth_flow(on_done):
    """Start OAuth in a thread. on_done(success: bool, msg: str)."""
    def worker():
        try:
            from google_auth_oauthlib.flow import InstalledAppFlow
        except ImportError:
            on_done(False, 'Установите: pip install google-auth-oauthlib')
            return

        custom = os.path.join(config.CONFIG_DIR, 'oauth_client.json')
        try:
            if os.path.exists(custom):
                flow = InstalledAppFlow.from_client_secrets_file(custom, SCOPES)
            else:
                flow = InstalledAppFlow.from_client_config(DEFAULT_CLIENT, SCOPES)
            flow.run_local_server(
                port=0, open_browser=True,
                success_message='Авторизация успешна! Можно закрыть вкладку.')
            creds = flow.credentials
            os.makedirs(config.CONFIG_DIR, exist_ok=True)
            with open(config.TOKEN_PATH, 'w', encoding='utf-8') as f:
                f.write(creds.to_json())
            on_done(True, 'Авторизация прошла успешно.')
        except Exception as e:
            on_done(False, f'Ошибка OAuth: {e}')

    threading.Thread(target=worker, daemon=True).start()


def is_authorized():
    return os.path.exists(config.TOKEN_PATH)


def logout():
    if os.path.exists(config.TOKEN_PATH):
        os.remove(config.TOKEN_PATH)
