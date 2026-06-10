"""Map Screen Translator lang codes to NLLB-200 FLORES codes."""

NLLB = {
    'en': 'eng_Latn',
    'ru': 'rus_Cyrl',
    'de': 'deu_Latn',
    'fr': 'fra_Latn',
    'es': 'spa_Latn',
    'it': 'ita_Latn',
    'pt': 'por_Latn',
    'pl': 'pol_Latn',
    'uk': 'ukr_Cyrl',
    'ja': 'jpn_Jpan',
    'ko': 'kor_Hang',
    'tr': 'tur_Latn',
    'zh-CN': 'zho_Hans',
    'ar': 'arb_Arab',
}

OCR_TO_LANG = {
    'en': 'en', 'en-us': 'en', 'en-gb': 'en',
    'ru': 'ru', 'ru-ru': 'ru',
    'de': 'de', 'de-de': 'de',
    'fr': 'fr', 'fr-fr': 'fr',
    'es': 'es', 'es-es': 'es',
    'it': 'it', 'it-it': 'it',
    'pt': 'pt', 'pt-br': 'pt',
    'pl': 'pl', 'pl-pl': 'pl',
    'uk': 'uk', 'uk-ua': 'uk',
    'ja': 'ja', 'ja-jp': 'ja',
    'ko': 'ko', 'ko-kr': 'ko',
    'tr': 'tr', 'tr-tr': 'tr',
    'zh': 'zh-CN', 'zh-cn': 'zh-CN',
    'ar': 'ar',
}


def resolve_source(source, ocr_hint=None):
    if source and source != 'auto':
        return NLLB.get(source, 'eng_Latn')
    if ocr_hint:
        key = ocr_hint.lower().replace('_', '-')
        lang = OCR_TO_LANG.get(key) or OCR_TO_LANG.get(key.split('-')[0])
        if lang and lang in NLLB:
            return NLLB[lang]
    return 'eng_Latn'


def resolve_target(target):
    return NLLB.get(target, 'rus_Cyrl')
