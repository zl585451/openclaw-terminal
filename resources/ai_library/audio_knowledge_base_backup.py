#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
闊抽涓撲笟鐭ヨ瘑搴撶郴缁?鍔熻兘锛?1. 璇诲彇Markdown/PDF鏂囦欢
2. 鏂囨。鍒嗗潡锛?00瀛楃锛?0瀛楃閲嶅彔锛?3. 鍚戦噺鍖栧瓨鍌紙ChromaDB锛?4. 澧為噺鏇存柊锛圫QLite璁板綍鏂囦欢鐘舵€侊級
5. QA瀵圭敓鎴愬櫒 - 涓烘枃妗ｅ潡鐢熸垚棰勮闂瓟瀵?"""

import os
import sqlite3
import hashlib
import json
import time
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, field
import warnings
warnings.filterwarnings('ignore')

# 鏂囨。澶勭悊
import fitz  # PyMuPDF
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitter import RecursiveCharacterTextSplitter

# 鍚戦噺鏁版嵁搴?import chromadb
from chromadb.config import Settings

# Embedding & LLM
try:
    from openai import OpenAI
    import httpx
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False

HAS_PADDLEOCR = None

def check_paddleocr():
    global HAS_PADDLEOCR
    if HAS_PADDLEOCR is None:
        try:
            from paddleocr import PaddleOCR
            HAS_PADDLEOCR = True
        except ImportError:
            HAS_PADDLEOCR = False
    return HAS_PADDLEOCR


class Config:
    """閰嶇疆绫?""
    # 鏂囨。鐩綍
    DOCUMENTS_DIR = "./documents"
    
    # 鏁版嵁搴撹矾寰?    SQLITE_DB_PATH = "./data/file_records.db"
    CHROMA_DB_PATH = "./data/chroma_db"
    QA_SQLITE_DB_PATH = "./data/qa_records.db"
    QA_CHROMA_DB_PATH = "./data/qa_chroma_db"
    QA_JSON_OUTPUT_PATH = "./data/qa_pairs.json"
    
    # 鍒嗗潡閰嶇疆
    CHUNK_SIZE = 800
    CHUNK_OVERLAP = 150
    
    # Embedding閰嶇疆
    EMBEDDING_TYPE = os.getenv("EMBEDDING_TYPE", "local")
    
    # DeepSeek API閰嶇疆
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
    DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
    
    # OpenAI API閰嶇疆
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    
    # 鏈湴妯″瀷閰嶇疆
    LOCAL_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
    
    # LLM閰嶇疆锛堢敤浜嶲A鐢熸垚锛?    LLM_TYPE = "deepseek"
    LLM_MODEL = "deepseek-chat"
    LLM_MAX_TOKENS = 2000
    LLM_TEMPERATURE = 0.7
    
    # QA鐢熸垚閰嶇疆
    QA_MIN_COUNT = 3
    QA_MAX_COUNT = 5
    QA_BATCH_SIZE = 5
    
    # OCR閰嶇疆
    OCR_ENABLED = True
    OCR_ENGINE = "paddleocr"
    OCR_LANGUAGE = "ch"
    OCR_USE_GPU = False
    
    # 鏅鸿兘OCR閰嶇疆
    OCR_MODE = "smart"
    OCR_QUALITY_THRESHOLD = 0.85
    OCR_API_FALLBACK = True
    OCR_SAVE_STATS = True
    OCR_STATS_PATH = "./data/ocr_stats.json"
    
    # 鍥惧儚澧炲己閰嶇疆
    IMAGE_ENHANCE_ENABLED = True
    IMAGE_DENOISE_STRENGTH = 10
    IMAGE_SHARPEN_KERNEL = [[-1,-1,-1], [-1,9,-1], [-1,-1,-1]]
    IMAGE_CONTRAST_ALPHA = 1.5
    IMAGE_CONTRAST_BETA = 0
    IMAGE_CLAHE_CLIP_LIMIT = 2.0
    IMAGE_BINARY_THRESHOLD = 127
    
    # PDF杞浘鍍忛厤缃?    PDF_DPI = 200
    
    # 鏂囦欢澶у皬闄愬埗
    MAX_FILE_SIZE_MB = 100  # 鍗曚釜鏂囦欢鏈€澶?00MB
    MAX_PDF_PAGES = 200     # PDF鏈€澶ч〉鏁伴檺鍒?
    # 鏀寔鐨勬枃浠舵墿灞曞悕
    SUPPORTED_EXTENSIONS = {'.md', '.markdown', '.pdf'}


class ImageEnhancer:
    """鎵弿浠跺浘鍍忓寮哄鐞嗗櫒"""
    
    def __init__(self, config: Config):
        self.config = config
        self._check_dependencies()
    
    def _check_dependencies(self):
        if not HAS_CV2:
            print("璀﹀憡: cv2鏈畨瑁咃紝鍥惧儚澧炲己鍔熻兘涓嶅彲鐢?)
    
    def enhance(self, image: 'np.ndarray') -> 'np.ndarray':
        if not HAS_CV2:
            return image
        
        img = image.copy()
        
        if self.config.IMAGE_ENHANCE_ENABLED:
            img = self._apply_contrast(img)
            img = self._apply_denoise(img)
            img = self._apply_sharpen(img)
            img = self._apply_clahe(img)
        
        return img
    
    def _apply_contrast(self, img: 'np.ndarray') -> 'np.ndarray':
        alpha = self.config.IMAGE_CONTRAST_ALPHA
        beta = self.config.IMAGE_CONTRAST_BETA
        return cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
    
    def _apply_denoise(self, img: 'np.ndarray') -> 'np.ndarray':
        strength = self.config.IMAGE_DENOISE_STRENGTH
        if len(img.shape) == 3:
            return cv2.fastNlMeansDenoisingColored(img, None, strength, strength, 7, 21)
        else:
            return cv2.fastNlMeansDenoising(img, None, strength, 7, 21)
    
    def _apply_sharpen(self, img: 'np.ndarray') -> 'np.ndarray':
        kernel = np.array(self.config.IMAGE_SHARPEN_KERNEL, dtype=np.float32)
        return cv2.filter2D(img, -1, kernel)
    
    def _apply_clahe(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) == 3:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=self.config.IMAGE_CLAHE_CLIP_LIMIT)
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=self.config.IMAGE_CLAHE_CLIP_LIMIT)
            return clahe.apply(img)
    
    def apply_binary(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img
        _, binary = cv2.threshold(gray, self.config.IMAGE_BINARY_THRESHOLD, 255, cv2.THRESH_BINARY)
        return binary
    
    def enhance_for_ocr(self, image: 'np.ndarray', use_binary: bool = False) -> 'np.ndarray':
        img = self.enhance(image)
        if use_binary:
            img = self.apply_binary(img)
        return img


class SmartOCR:
    """鏅鸿兘OCR澶勭悊鍣?- 鍏嶈垂浼樺厛锛孉PI淇濆簳"""
    
    def __init__(self, config: Config):
        self.config = config
        self._paddle_ocr = None
        self._openai_client = None
        
        self.quality_threshold = config.OCR_QUALITY_THRESHOLD
        self.use_api_fallback = config.OCR_API_FALLBACK
        
        self.stats = {
            'total_pages': 0,
            'paddle_success': 0,
            'api_fallback': 0,
            'low_quality': 0,
            'total_cost': 0.0
        }
        
        self._check_dependencies()
    
    def _check_dependencies(self):
        if not HAS_PDF2IMAGE:
            print("璀﹀憡: pdf2image鏈畨瑁咃紝PDF杞浘鍍忓姛鑳戒笉鍙敤")
        if not HAS_CV2:
            print("璀﹀憡: opencv鏈畨瑁咃紝鍥惧儚棰勫鐞嗗姛鑳戒笉鍙敤")
    
    @property
    def paddle_ocr(self):
        if self._paddle_ocr is None:
            if check_paddleocr():
                from paddleocr import PaddleOCR
                print("姝ｅ湪鍒濆鍖朠addleOCR锛堥娆′娇鐢ㄩ渶瑕佷笅杞芥ā鍨嬶級...")
                self._paddle_ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang=self.config.OCR_LANGUAGE,
                    use_gpu=self.config.OCR_USE_GPU,
                    show_log=False
                )
        return self._paddle_ocr
    
    @property
    def openai_client(self):
        if self._openai_client is None and HAS_OPENAI:
            api_key = self.config.DEEPSEEK_API_KEY or os.getenv("DEEPSEEK_API_KEY")
            if api_key:
                self._openai_client = OpenAI(
                    api_key=api_key,
                    base_url=self.config.DEEPSEEK_BASE_URL,
                    http_client=httpx.Client(trust_env=False)
                )
        return self._openai_client
    
    def preprocess_image(self, image: 'np.ndarray') -> 'np.ndarray':
        if not HAS_CV2:
            return image
        
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        binary = cv2.adaptiveThreshold(
            enhanced, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )
        
        denoised = cv2.fastNlMeansDenoising(binary, None, 30, 7, 21)
        
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        
        return sharpened
    
    def assess_recognition_quality(self, text: str, image_shape: tuple) -> float:
        if not text or not text.strip():
            return 0.0
        
        quality_score = 1.0
        text_len = len(text.strip())
        img_area = image_shape[0] * image_shape[1] if image_shape else 1
        
        if text_len < 10:
            quality_score *= 0.3
        elif text_len < 50:
            quality_score *= 0.7
        
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        chinese_ratio = chinese_chars / max(text_len, 1)
        if chinese_ratio < 0.1:
            quality_score *= 0.8
        
        special_chars = sum(1 for c in text if not c.isprintable() and c not in '\n\r\t')
        if special_chars > text_len * 0.2:
            quality_score *= 0.2
        
        text_density = text_len / (img_area / 10000)
        if text_density < 0.5:
            quality_score *= 0.8
        
        return min(quality_score, 1.0)
    
    def ocr_page(self, image: 'np.ndarray') -> Tuple[str, str, float]:
        self.stats['total_pages'] += 1
        
        processed_img = self.preprocess_image(image)
        
        text = ""
        if self.paddle_ocr is not None:
            try:
                result = self.paddle_ocr.ocr(processed_img, cls=True)
                if result and result[0]:
                    text_lines = []
                    for line in result[0]:
                        if line and len(line) >= 2:
                            text_lines.append(line[1][0])
                    text = '\n'.join(text_lines)
            except Exception as e:
                print(f"    PaddleOCR璇嗗埆鍑洪敊: {e}")
                text = ""
        
        quality = self.assess_recognition_quality(text, image.shape if HAS_CV2 else None)
        
        if quality >= self.quality_threshold:
            self.stats['paddle_success'] += 1
            return text, 'paddle', quality
        
        if self.use_api_fallback and quality < self.quality_threshold and self.openai_client:
            self.stats['api_fallback'] += 1
            try:
                api_text = self.deepseek_ocr(image)
                if api_text and len(api_text.strip()) > len(text.strip()):
                    self.stats['total_cost'] += 0.01
                    return api_text, 'deepseek', 1.0
            except Exception as e:
                print(f"    API淇濆簳澶辫触: {e}")
        
        self.stats['low_quality'] += 1
        return text, 'paddle_low_quality', quality
    
    def deepseek_ocr(self, image: 'np.ndarray') -> str:
        import base64
        
        if len(image.shape) == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        
        _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 85])
        base64_image = base64.b64encode(buffer).decode('utf-8')
        
        response = self.openai_client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        },
                        {
                            "type": "text",
                            "text": "璇锋彁鍙栬繖寮犲浘鐗囦腑鐨勬墍鏈夋枃瀛楋紝鐩存帴杩斿洖鎻愬彇鍒扮殑鏂囧瓧鍐呭锛屼繚鎸佸師鏈夌殑娈佃惤鏍煎紡锛屼笉瑕佹坊鍔犱换浣曡В閲娿€?
                        }
                    ]
                }
            ],
            max_tokens=4000
        )
        
        return response.choices[0].message.content
    
    def pdf_to_images(self, pdf_path: str) -> List['np.ndarray']:
        """灏哖DF杞崲涓哄浘鍍忓垪琛紝甯︽湁椤垫暟闄愬埗闃叉鍐呭瓨婧㈠嚭"""
        if not HAS_PDF2IMAGE:
            print("pdf2image鏈畨瑁咃紝鏃犳硶杞崲PDF")
            return []
        
        images = convert_from_path(pdf_path, dpi=self.config.PDF_DPI)
        
        # 闄愬埗椤垫暟锛岄槻姝㈠唴瀛樻孩鍑?        if len(images) > self.config.MAX_PDF_PAGES:
            print(f"    鈿狅笍 PDF椤垫暟杩囧 ({len(images)}椤?锛屼粎澶勭悊鍓?{self.config.MAX_PDF_PAGES} 椤?)
            images = images[:self.config.MAX_PDF_PAGES]
        
        return [np.array(img) for img in images]
    
    def process_pdf(self, pdf_path: str) -> Tuple[str, Dict]:
        images = self.pdf_to_images(pdf_path)
        if not images:
            return "", {"pages_processed": 0, "ocr_used": False}
        
        all_text = []
        page_stats = []
        
        total_pages = len(images)
        for i, img in enumerate(images):
            print(f"    OCR澶勭悊: 绗?{i+1}/{total_pages} 椤?..", end='\r')
            text, method, quality = self.ocr_page(img)
            
            if text.strip():
                all_text.append(f"[绗瑊i+1}椤礭\n{text}")
            
            page_stats.append({
                'page': i + 1,
                'method': method,
                'quality': quality,
                'char_count': len(text.strip())
            })
        
        print(f"    OCR澶勭悊瀹屾垚: {total_pages} 椤?                   ")
        
        full_text = '\n\n'.join(all_text)
        
        return full_text, {
            "pages_processed": len(images),
            "ocr_used": True,
            "stats": self.stats.copy(),
            "page_stats": page_stats
        }
    
    def get_stats_report(self) -> str:
        total = self.stats['total_pages']
        if total == 0:
            return "灏氭湭澶勭悊浠讳綍椤甸潰"
        
        paddle_rate = self.stats['paddle_success'] / total * 100
        api_rate = self.stats['api_fallback'] / total * 100
        low_rate = self.stats['low_quality'] / total * 100
        
        report = f"""
OCR缁熻鎶ュ憡:
  鎬婚〉鏁? {total}
  PaddleOCR鎴愬姛: {self.stats['paddle_success']} ({paddle_rate:.1f}%)
  API淇濆簳: {self.stats['api_fallback']} ({api_rate:.1f}%)
  浣庤川閲忕粨鏋? {self.stats['low_quality']} ({low_rate:.1f}%)
  棰勪及API璐圭敤: 楼{self.stats['total_cost']:.2f}
"""
        return report


class OCRProcessor:
    """OCR澶勭悊鍣?- 鍏煎鏃ф帴鍙ｏ紝鍐呴儴浣跨敤SmartOCR"""
    
    def __init__(self, config: Config):
        self.config = config
        self.smart_ocr = SmartOCR(config) if config.OCR_ENABLED else None
        self._check_dependencies()
    
    def _check_dependencies(self):
        if not HAS_PDF2IMAGE:
            print("璀﹀憡: pdf2image鏈畨瑁咃紝PDF杞浘鍍忓姛鑳戒笉鍙敤")
    
    def pdf_to_images(self, pdf_path: str) -> List['np.ndarray']:
        if self.smart_ocr:
            return self.smart_ocr.pdf_to_images(pdf_path)
        return []
    
    def ocr_image(self, image: 'np.ndarray', enhance: bool = True) -> str:
        if self.smart_ocr:
            text, method, quality = self.smart_ocr.ocr_page(image)
            return text
        return ""
    
    def process_pdf(self, pdf_path: str, enhance: bool = True) -> Tuple[str, Dict]:
        if self.smart_ocr:
            return self.smart_ocr.process_pdf(pdf_path)
        return "", {"pages_processed": 0, "ocr_used": False}
    
    def get_stats_report(self) -> str:
        if self.smart_ocr:
            return self.smart_ocr.get_stats_report()
        return "OCR鏈惎鐢?


class FileRecordDB:
    """鏂囦欢璁板綍鏁版嵁搴擄紙SQLite锛?""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS file_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT UNIQUE NOT NULL,
                    file_hash TEXT NOT NULL,
                    last_processed TEXT NOT NULL,
                    chunk_count INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
    
    def compute_file_hash(self, file_path: str) -> str:
        hasher = hashlib.sha256()
        with open(file_path, 'rb') as f:
            while chunk := f.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    
    def get_file_record(self, file_path: str) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM file_records WHERE file_path = ?',
                (file_path,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def upsert_file_record(self, file_path: str, file_hash: str, chunk_count: int):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            cursor.execute('''
                INSERT INTO file_records (file_path, file_hash, last_processed, chunk_count, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(file_path) DO UPDATE SET
                    file_hash = excluded.file_hash,
                    last_processed = excluded.last_processed,
                    chunk_count = excluded.chunk_count,
                    updated_at = excluded.updated_at
            ''', (file_path, file_hash, now, chunk_count, now))
            conn.commit()
    
    def delete_file_record(self, file_path: str):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM file_records WHERE file_path = ?', (file_path,))
            conn.commit()
    
    def needs_processing(self, file_path: str) -> bool:
        if not os.path.exists(file_path):
            return False
        
        record = self.get_file_record(file_path)
        if not record:
            return True
        
        current_hash = self.compute_file_hash(file_path)
        return current_hash != record['file_hash']


@dataclass
class SourceReference:
    """鏉ユ簮寮曠敤"""
    document: str
    chunk_index: int = 0
    confidence: float = 0.0
    relevant_text: str = ""
    
    def __str__(self) -> str:
        return f"{self.document}" + (f"-绗瑊self.chunk_index+1}娈? if self.chunk_index else "")


@dataclass
class RetrievedQA:
    """妫€绱㈠埌鐨凲A瀵?""
    question: str
    answer: str
    summary: str = ""
    source: SourceReference = None
    confidence: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            'question': self.question,
            'answer': self.answer,
            'summary': self.summary,
            'source': str(self.source) if self.source else None,
            'confidence': self.confidence
        }


@dataclass
class AnswerResult:
    """鐢熸垚鐨勭瓟妗堢粨鏋?""
    text: str
    sources: List[str] = field(default_factory=list)
    source_details: List[SourceReference] = field(default_factory=list)
    confidence: float = 0.0
    retrieved_qa: List[RetrievedQA] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            'text': self.text,
            'sources': self.sources,
            'confidence': self.confidence,
            'retrieved_qa': [qa.to_dict() for qa in self.retrieved_qa]
        }
    
    def __str__(self) -> str:
        result = self.text
        if self.sources:
            result += f"\n\n馃摎 鏉ユ簮: {', '.join(self.sources)}"
        return result


@dataclass
class Message:
    """瀵硅瘽娑堟伅"""
    role: str
    content: str
    
    def to_dict(self) -> Dict:
        return {'role': self.role, 'content': self.content}


class QARecordDB:
    """QA瀵硅褰曟暟鎹簱锛圫QLite锛?""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS qa_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chunk_id TEXT UNIQUE NOT NULL,
                    source_file TEXT NOT NULL,
                    chunk_hash TEXT NOT NULL,
                    qa_count INTEGER DEFAULT 0,
                    last_processed TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS qa_pairs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chunk_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    summary TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chunk_id) REFERENCES qa_records(chunk_id)
                )
            ''')
            conn.commit()
    
    def compute_chunk_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def get_chunk_record(self, chunk_id: str) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM qa_records WHERE chunk_id = ?',
                (chunk_id,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def needs_processing(self, chunk_id: str, chunk_content: str) -> bool:
        record = self.get_chunk_record(chunk_id)
        if not record:
            return True
        
        current_hash = self.compute_chunk_hash(chunk_content)
        return current_hash != record['chunk_hash']
    
    def upsert_qa_record(self, chunk_id: str, source_file: str, chunk_hash: str, qa_count: int):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            cursor.execute('''
                INSERT INTO qa_records (chunk_id, source_file, chunk_hash, qa_count, last_processed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(chunk_id) DO UPDATE SET
                    chunk_hash = excluded.chunk_hash,
                    qa_count = excluded.qa_count,
                    last_processed = excluded.last_processed,
                    updated_at = excluded.updated_at
            ''', (chunk_id, source_file, chunk_hash, qa_count, now, now))
            conn.commit()
    
    def insert_qa_pairs(self, chunk_id: str, qa_pairs: List[Dict]):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM qa_pairs WHERE chunk_id = ?', (chunk_id,))
            
            for qa in qa_pairs:
                cursor.execute('''
                    INSERT INTO qa_pairs (chunk_id, question, answer, summary)
                    VALUES (?, ?, ?, ?)
                ''', (chunk_id, qa['question'], qa['answer'], qa.get('summary', '')))
            conn.commit()
    
    def get_all_qa_pairs(self) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT q.*, r.source_file 
                FROM qa_pairs q 
                JOIN qa_records r ON q.chunk_id = r.chunk_id
            ''')
            return [dict(row) for row in cursor.fetchall()]
    
    def delete_by_source(self, source_file: str):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                DELETE FROM qa_pairs WHERE chunk_id IN 
                (SELECT chunk_id FROM qa_records WHERE source_file = ?)
            ''', (source_file,))
            cursor.execute('DELETE FROM qa_records WHERE source_file = ?', (source_file,))
            conn.commit()
    
    def get_stats(self) -> Dict:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM qa_records')
            chunk_count = cursor.fetchone()[0]
            cursor.execute('SELECT COUNT(*) FROM qa_pairs')
            qa_count = cursor.fetchone()[0]
            return {'chunk_count': chunk_count, 'qa_count': qa_count}


class DocumentProcessor:
    """鏂囨。澶勭悊鍣?""
    
    def __init__(self, config: Config):
        self.config = config
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            length_function=len,
            separators=['\n\n', '\n', '銆?, '锛?, '锛?, '锛?, '.', '!', '?', ';', ' ', '']
        )
        self.ocr_processor = None
        if config.OCR_ENABLED:
            self.ocr_processor = OCRProcessor(config)
    
    def validate_file(self, file_path: str) -> Tuple[bool, str]:
        """
        楠岃瘉鏂囦欢鏄惁鍙互澶勭悊
        
        Returns:
            Tuple[bool, str]: (鏄惁閫氳繃楠岃瘉, 閿欒淇℃伅)
        """
        # 妫€鏌ユ枃浠跺ぇ灏?        size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if size_mb > self.config.MAX_FILE_SIZE_MB:
            return False, f"鏂囦欢杩囧ぇ ({size_mb:.1f}MB)锛岃秴杩囬檺鍒?({self.config.MAX_FILE_SIZE_MB}MB)"
        
        # 妫€鏌DF椤垫暟
        ext = Path(file_path).suffix.lower()
        if ext == '.pdf':
            try:
                with fitz.open(file_path) as doc:
                    page_count = len(doc)
                    if page_count > self.config.MAX_PDF_PAGES:
                        return False, f"PDF椤垫暟杩囧 ({page_count}椤?锛岃秴杩囬檺鍒?({self.config.MAX_PDF_PAGES}椤?"
            except Exception as e:
                return False, f"PDF鏂囦欢鏃犳硶鎵撳紑: {e}"
        
        return True, ""
    
    def read_markdown(self, file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    def read_pdf(self, file_path: str, force_ocr: bool = False) -> Tuple[str, Dict]:
        text_parts = []
        metadata = {"ocr_used": False, "pages": 0}
        
        with fitz.open(file_path) as doc:
            metadata["pages"] = len(doc)
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_parts.append(text)
        
        normal_text = '\n\n'.join(text_parts)
        
        if force_ocr or (len(normal_text.strip()) < 100 and self.ocr_processor):
            print(f"  妫€娴嬪埌鎵弿浠舵垨鏂囨湰杩囧皯锛屽惎鐢∣CR澶勭悊: {Path(file_path).name}")
            try:
                ocr_text, ocr_meta = self.ocr_processor.process_pdf(file_path)
                if ocr_text.strip():
                    metadata["ocr_used"] = True
                    metadata["ocr_pages"] = ocr_meta.get("pages_processed", 0)
                    metadata["ocr_stats"] = ocr_meta.get("stats", {})
                    metadata["page_stats"] = ocr_meta.get("page_stats", [])
                    
                    if self.config.OCR_SAVE_STATS and self.ocr_processor.smart_ocr:
                        self._save_ocr_stats(file_path, ocr_meta)
                    
                    return ocr_text, metadata
            except Exception as e:
                print(f"  OCR澶勭悊澶辫触锛堝彲鑳介渶瑕佸畨瑁匬oppler锛? {e}")
                if normal_text.strip():
                    print(f"  浣跨敤鍘熷鏂囨湰鍐呭")
                    return normal_text, metadata
        
        return normal_text, metadata
    
    def _save_ocr_stats(self, file_path: str, ocr_meta: Dict):
        import json
        from datetime import datetime
        
        stats_dir = os.path.dirname(self.config.OCR_STATS_PATH)
        os.makedirs(stats_dir, exist_ok=True)
        
        stats_record = {
            "file": file_path,
            "filename": Path(file_path).name,
            "timestamp": datetime.now().isoformat(),
            "stats": ocr_meta.get("stats", {}),
            "page_stats": ocr_meta.get("page_stats", [])
        }
        
        stats_path = self.config.OCR_STATS_PATH
        existing_stats = []
        if os.path.exists(stats_path):
            try:
                with open(stats_path, 'r', encoding='utf-8') as f:
                    existing_stats = json.load(f)
            except:
                pass
        
        existing_stats.append(stats_record)
        
        with open(stats_path, 'w', encoding='utf-8') as f:
            json.dump(existing_stats, f, ensure_ascii=False, indent=2)
    
    def read_document(self, file_path: str, force_ocr: bool = False) -> Tuple[Optional[str], Dict]:
        ext = Path(file_path).suffix.lower()
        metadata = {"file_path": file_path, "file_name": Path(file_path).name}
        
        if ext in {'.md', '.markdown'}:
            return self.read_markdown(file_path), metadata
        elif ext == '.pdf':
            return self.read_pdf(file_path, force_ocr=force_ocr)
        else:
            print(f"涓嶆敮鎸佺殑鏂囦欢绫诲瀷: {ext}")
            return None, metadata
    
    def split_text(self, text: str, metadata: Dict = None) -> List[Dict]:
        chunks = self.text_splitter.split_text(text)
        
        result = []
        for i, chunk in enumerate(chunks):
            chunk_data = {
                'content': chunk,
                'metadata': {
                    **(metadata or {}),
                    'chunk_index': i,
                    'total_chunks': len(chunks)
                }
            }
            result.append(chunk_data)
        
        return result
    
    def process_file(self, file_path: str, force_ocr: bool = False) -> List[Dict]:
        # 鍏堥獙璇佹枃浠?        is_valid, error_msg = self.validate_file(file_path)
        if not is_valid:
            print(f"  鈿狅笍 璺宠繃鏂囦欢: {error_msg}")
            return []
        
        text, read_metadata = self.read_document(file_path, force_ocr=force_ocr)
        if not text:
            return []
        
        metadata = {
            'source': file_path,
            'filename': Path(file_path).name,
            'processed_at': datetime.now().isoformat(),
            **read_metadata
        }
        
        return self.split_text(text, metadata)


class EmbeddingService:
    """Embedding鏈嶅姟"""
    
    def __init__(self, config: Config):
        self.config = config
        self.model = None
        self.client = None
        self._init_embedding()
    
    def _init_embedding(self):
        if self.config.EMBEDDING_TYPE == "deepseek":
            if not HAS_OPENAI:
                raise ImportError("浣跨敤DeepSeek闇€瑕佸畨瑁卭penai搴? pip install openai")
            if not self.config.DEEPSEEK_API_KEY:
                raise ValueError("DEEPSEEK_API_KEY鐜鍙橀噺鏈缃€傝鍦ㄧ幆澧冨彉閲忎腑璁剧疆鏈夋晥鐨凞eepSeek API瀵嗛挜銆?)
            self.client = OpenAI(
                api_key=self.config.DEEPSEEK_API_KEY,
                base_url=self.config.DEEPSEEK_BASE_URL,
                http_client=httpx.Client(trust_env=False)
            )
            print("浣跨敤DeepSeek Embedding API")
            
        elif self.config.EMBEDDING_TYPE == "openai":
            if not HAS_OPENAI:
                raise ImportError("浣跨敤OpenAI闇€瑕佸畨瑁卭penai搴? pip install openai")
            self.client = OpenAI(
                api_key=self.config.OPENAI_API_KEY,
                base_url=self.config.OPENAI_BASE_URL,
                http_client=httpx.Client(trust_env=False)
            )
            print("浣跨敤OpenAI Embedding API")
            
        else:
            if not HAS_SENTENCE_TRANSFORMERS:
                raise ImportError("浣跨敤鏈湴妯″瀷闇€瑕佸畨瑁卻entence-transformers: pip install sentence-transformers")
            self.model = SentenceTransformer(self.config.LOCAL_MODEL_NAME)
            print(f"浣跨敤鏈湴妯″瀷: {self.config.LOCAL_MODEL_NAME}")
    
    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        if self.model:
            embeddings = self.model.encode(texts, show_progress_bar=False)
            return embeddings.tolist()
        
        elif self.client:
            embeddings = []
            batch_size = 100
            
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                
                if self.config.EMBEDDING_TYPE == "deepseek":
                    response = self.client.embeddings.create(
                        model="deepseek-embedding",
                        input=batch
                    )
                else:
                    response = self.client.embeddings.create(
                        model="text-embedding-3-small",
                        input=batch
                    )
                
                batch_embeddings = [item.embedding for item in response.data]
                embeddings.extend(batch_embeddings)
            
            return embeddings
        
        raise ValueError("Embedding鏈嶅姟鏈纭垵濮嬪寲")
    
    def get_embedding_dimension(self) -> int:
        if self.model:
            return self.model.get_sentence_embedding_dimension()
        elif self.config.EMBEDDING_TYPE == "deepseek":
            return 1536
        else:
            return 1536


class LLMService:
    """澶фā鍨嬫湇鍔★紙鐢ㄤ簬QA鐢熸垚锛?""
    
    def __init__(self, config: Config):
        self.config = config
        self.client = None
        self._init_llm()
    
    def _init_llm(self):
        if not HAS_OPENAI:
            raise ImportError("浣跨敤LLM闇€瑕佸畨瑁卭penai搴? pip install openai")
        
        if self.config.LLM_TYPE == "deepseek":
            if not self.config.DEEPSEEK_API_KEY:
                raise ValueError("DEEPSEEK_API_KEY鐜鍙橀噺鏈缃€傝鍦ㄧ幆澧冨彉閲忎腑璁剧疆鏈夋晥鐨凞eepSeek API瀵嗛挜銆?)
            self.client = OpenAI(
                api_key=self.config.DEEPSEEK_API_KEY,
                base_url=self.config.DEEPSEEK_BASE_URL,
                http_client=httpx.Client(trust_env=False)
            )
            print(f"浣跨敤DeepSeek LLM: {self.config.LLM_MODEL}")
        else:
            self.client = OpenAI(
                api_key=self.config.OPENAI_API_KEY,
                base_url=self.config.OPENAI_BASE_URL,
                http_client=httpx.Client(trust_env=False)
            )
            print(f"浣跨敤OpenAI LLM: {self.config.LLM_MODEL}")
    
    def generate_qa_pairs(self, chunk_content: str, min_count: int = 3, max_count: int = 5, max_retries: int = 3) -> List[Dict]:
        prompt = f"""浣犳槸涓€涓煶棰戜笓涓氱煡璇嗗簱鐨勯棶绛斿鐢熸垚涓撳銆傝鏍规嵁浠ヤ笅鏂囨。鍐呭锛岀敓鎴恵min_count}-{max_count}涓珮璐ㄩ噺鐨勯棶绛斿銆?
瑕佹眰锛?1. 闂搴旇娑电洊鏂囨。涓殑鍏抽敭鐭ヨ瘑鐐?2. 闂搴旇鍏锋湁瀹為檯搴旂敤浠峰€硷紝妯℃嫙鐢ㄦ埛鍙兘鎻愬嚭鐨勭湡瀹為棶棰?3. 绛旀搴旇鍑嗙‘銆佸畬鏁达紝鐩存帴寮曠敤鎴栨€荤粨鏂囨。鍐呭
4. 姣忎釜闂瓟瀵归渶瑕佷竴涓畝鐭殑鎽樿锛?0瀛椾互鍐咃級
5. 璇风‘淇濋棶棰樿鐩栦互涓嬬淮搴︼細
   - 璇ュ弬鏁?鎶€鏈湪骞挎挱鍓у満鏅笅鐨勫叿浣撳簲鐢?   - 涓庡悓绫绘柟娉?宸ュ叿鐨勫姣?   - 甯歌閿欒鐢ㄦ硶鍜岄伩鍧戝缓璁?   - 涓嶅悓椋庢牸/棰樻潗涓嬬殑鍙傛暟宸紓

鏂囨。鍐呭锛?{chunk_content}

璇蜂弗鏍兼寜鐓т互涓婮SON鏍煎紡杈撳嚭锛屼笉瑕佸寘鍚换浣曞叾浠栧唴瀹癸細
{{
  "qa_pairs": [
    {{
      "question": "鍏蜂綋鐨勯棶棰?,
      "answer": "璇︾粏鐨勭瓟妗?,
      "summary": "绠€鐭憳瑕?
    }}
  ]
}}"""

        last_error = None
        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.config.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": "浣犳槸涓€涓笓涓氱殑闊抽鐭ヨ瘑闂瓟瀵圭敓鎴愬姪鎵嬶紝鎿呴暱浠庢妧鏈枃妗ｄ腑鎻愬彇鍏抽敭淇℃伅骞剁敓鎴愰珮璐ㄩ噺鐨勯棶绛斿銆?},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=self.config.LLM_MAX_TOKENS,
                    temperature=self.config.LLM_TEMPERATURE
                )
                
                content = response.choices[0].message.content.strip()
                
                try:
                    result = json.loads(content)
                    return result.get('qa_pairs', [])
                except json.JSONDecodeError as e:
                    try:
                        json_match = re.search(r'\{[\s\S]*\}', content)
                        if json_match:
                            result = json.loads(json_match.group())
                            return result.get('qa_pairs', [])
                    except Exception as e2:
                        print(f"    JSON瑙ｆ瀽澶辫触: {e}, {e2}")
                        print(f"    杩斿洖鍐呭: {content[:200]}...")
                        return []
                
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = 1.0 * (2 ** attempt)  # 鎸囨暟閫€閬匡細1s, 2s, 4s
                    print(f"    LLM璋冪敤澶辫触锛寋wait_time:.0f}绉掑悗閲嶈瘯 ({attempt + 1}/{max_retries}): {e}")
                    time.sleep(wait_time)
        
        print(f"    LLM璋冪敤澶辫触锛堝凡閲嶈瘯{max_retries}娆★級: {last_error}")
        return []
    
    def generate_qa_pairs_batch(self, chunks: List[Dict], min_count: int = 3, max_count: int = 5) -> List[Dict]:
        results = []
        total = len(chunks)
        
        for i, chunk in enumerate(chunks):
            print(f"  鐢熸垚QA瀵?[{i+1}/{total}]: {chunk['metadata'].get('filename', 'unknown')} - 鍧?{chunk['metadata'].get('chunk_index', 0)}")
            
            qa_pairs = self.generate_qa_pairs(chunk['content'], min_count, max_count)
            
            if qa_pairs:
                print(f"    鐢熸垚 {len(qa_pairs)} 涓猀A瀵?)
                result = {
                    'chunk_id': f"{chunk['metadata']['source']}_{chunk['metadata']['chunk_index']}",
                    'source_file': chunk['metadata'].get('filename', 'unknown'),
                    'chunk_content': chunk['content'],
                    'qa_pairs': qa_pairs
                }
                results.append(result)
            else:
                print(f"    鏈敓鎴怮A瀵?)
            
            if i < total - 1:
                time.sleep(0.5)
        
        return results


class VectorStore:
    """鍚戦噺瀛樺偍"""
    
    def __init__(self, config: Config, embedding_service: EmbeddingService):
        self.config = config
        self.embedding_service = embedding_service
        self.client = None
        self.collection = None
        self._init_chroma()
    
    def _init_chroma(self):
        os.makedirs(self.config.CHROMA_DB_PATH, exist_ok=True)
        
        self.client = chromadb.PersistentClient(
            path=self.config.CHROMA_DB_PATH,
            settings=Settings(anonymized_telemetry=False)
        )
        
        self.collection = self.client.get_or_create_collection(
            name="audio_knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )
        
        print(f"ChromaDB鍒濆鍖栧畬鎴愶紝褰撳墠鏂囨。鏁? {self.collection.count()}")
    
    def add_documents(self, chunks: List[Dict]):
        if not chunks:
            return
        
        texts = [chunk['content'] for chunk in chunks]
        embeddings = self.embedding_service.get_embeddings(texts)
        
        ids = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            chunk_id = f"{chunk['metadata']['source']}_{chunk['metadata']['chunk_index']}"
            ids.append(chunk_id)
            
            metadata = chunk['metadata'].copy()
            metadata['content'] = chunk['content'][:500]
            metadatas.append(metadata)
        
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=texts
        )
    
    def delete_by_source(self, source: str):
        all_items = self.collection.get()
        
        ids_to_delete = []
        for i, metadata in enumerate(all_items['metadatas']):
            if metadata.get('source') == source:
                ids_to_delete.append(all_items['ids'][i])
        
        if ids_to_delete:
            self.collection.delete(ids=ids_to_delete)
            print(f"鍒犻櫎浜?{len(ids_to_delete)} 涓棫鍧?)
    
    def search(self, query: str, n_results: int = 5) -> List[Dict]:
        query_embedding = self.embedding_service.get_embeddings([query])[0]
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=['documents', 'metadatas', 'distances']
        )
        
        search_results = []
        for i in range(len(results['ids'][0])):
            search_results.append({
                'content': results['documents'][0][i],
                'metadata': results['metadatas'][0][i],
                'distance': results['distances'][0][i]
            })
        
        return search_results
    
    def get_all_chunks(self) -> List[Dict]:
        all_items = self.collection.get()
        chunks = []
        
        for i in range(len(all_items['ids'])):
            chunks.append({
                'chunk_id': all_items['ids'][i],
                'content': all_items['documents'][i],
                'metadata': all_items['metadatas'][i]
            })
        
        return chunks


class QAVectorStore:
    """QA瀵瑰悜閲忓瓨鍌?""
    
    def __init__(self, config: Config, embedding_service: EmbeddingService):
        self.config = config
        self.embedding_service = embedding_service
        self.client = None
        self.collection = None
        self._init_chroma()
    
    def _init_chroma(self):
        os.makedirs(self.config.QA_CHROMA_DB_PATH, exist_ok=True)
        
        self.client = chromadb.PersistentClient(
            path=self.config.QA_CHROMA_DB_PATH,
            settings=Settings(anonymized_telemetry=False)
        )
        
        self.collection = self.client.get_or_create_collection(
            name="qa_knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )
        
        print(f"QA鍚戦噺搴撳垵濮嬪寲瀹屾垚锛屽綋鍓峇A瀵规暟: {self.collection.count()}")
    
    def add_qa_pairs(self, qa_results: List[Dict]):
        if not qa_results:
            return
        
        all_questions = []
        all_ids = []
        all_metadatas = []
        all_documents = []
        
        for result in qa_results:
            chunk_id = result['chunk_id']
            source_file = result['source_file']
            
            for i, qa in enumerate(result['qa_pairs']):
                qa_id = f"{chunk_id}_qa_{i}"
                all_ids.append(qa_id)
                all_questions.append(qa['question'])
                all_documents.append(qa['answer'])
                
                all_metadatas.append({
                    'chunk_id': chunk_id,
                    'source_file': source_file,
                    'question': qa['question'],
                    'summary': qa.get('summary', ''),
                    'answer': qa['answer'][:500]
                })
        
        if not all_questions:
            return
        
        embeddings = self.embedding_service.get_embeddings(all_questions)
        
        self.collection.add(
            ids=all_ids,
            embeddings=embeddings,
            metadatas=all_metadatas,
            documents=all_documents
        )
    
    def delete_by_chunk(self, chunk_id: str):
        all_items = self.collection.get()
        
        ids_to_delete = []
        for i, metadata in enumerate(all_items['metadatas']):
            if metadata.get('chunk_id', '').startswith(chunk_id):
                ids_to_delete.append(all_items['ids'][i])
        
        if ids_to_delete:
            self.collection.delete(ids=ids_to_delete)
    
    def delete_by_source(self, source_file: str):
        all_items = self.collection.get()
        
        ids_to_delete = []
        for i, metadata in enumerate(all_items['metadatas']):
            if metadata.get('source_file') == source_file:
                ids_to_delete.append(all_items['ids'][i])
        
        if ids_to_delete:
            self.collection.delete(ids=ids_to_delete)
            print(f"鍒犻櫎浜?{len(ids_to_delete)} 涓猀A鍚戦噺")
    
    def search(self, query: str, n_results: int = 5) -> List[Dict]:
        query_embedding = self.embedding_service.get_embeddings([query])[0]
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=['documents', 'metadatas', 'distances']
        )
        
        search_results = []
        for i in range(len(results['ids'][0])):
            search_results.append({
                'answer': results['documents'][0][i],
                'question': results['metadatas'][0][i].get('question', ''),
                'metadata': results['metadatas'][0][i],
                'distance': results['distances'][0][i]
            })
        
        return search_results


class QAGenerator:
    """QA瀵圭敓鎴愬櫒"""
    
    def __init__(self, config: Config):
        self.config = config
        self.qa_db = QARecordDB(config.QA_SQLITE_DB_PATH)
        self.embedding_service = EmbeddingService(config)
        self.llm_service = LLMService(config)
        self.qa_vector_store = QAVectorStore(config, self.embedding_service)
    
    def generate_for_chunks(self, chunks: List[Dict], force: bool = False) -> List[Dict]:
        chunks_to_process = []
        
        for chunk in chunks:
            chunk_id = f"{chunk['metadata']['source']}_{chunk['metadata']['chunk_index']}"
            
            if not force and not self.qa_db.needs_processing(chunk_id, chunk['content']):
                print(f"  璺宠繃锛堝凡澶勭悊锛? {chunk_id}")
                continue
            
            chunks_to_process.append(chunk)
        
        if not chunks_to_process:
            print("鎵€鏈夊潡閮藉凡鐢熸垚QA瀵?)
            return []
        
        print(f"闇€瑕佺敓鎴怮A瀵圭殑鍧楁暟: {len(chunks_to_process)}")
        
        qa_results = self.llm_service.generate_qa_pairs_batch(
            chunks_to_process,
            self.config.QA_MIN_COUNT,
            self.config.QA_MAX_COUNT
        )
        
        return qa_results
    
    def save_qa_results(self, qa_results: List[Dict]):
        for result in qa_results:
            chunk_id = result['chunk_id']
            source_file = result['source_file']
            chunk_hash = self.qa_db.compute_chunk_hash(result['chunk_content'])
            qa_count = len(result['qa_pairs'])
            
            self.qa_db.upsert_qa_record(chunk_id, source_file, chunk_hash, qa_count)
            self.qa_db.insert_qa_pairs(chunk_id, result['qa_pairs'])
        
        self.qa_vector_store.add_qa_pairs(qa_results)
        
        self._save_to_json(qa_results)
    
    def _save_to_json(self, qa_results: List[Dict]):
        os.makedirs(os.path.dirname(self.config.QA_JSON_OUTPUT_PATH), exist_ok=True)
        
        existing_data = []
        if os.path.exists(self.config.QA_JSON_OUTPUT_PATH):
            with open(self.config.QA_JSON_OUTPUT_PATH, 'r', encoding='utf-8') as f:
                try:
                    existing_data = json.load(f)
                except:
                    existing_data = []
        
        existing_ids = {item['chunk_id'] for item in existing_data}
        
        for result in qa_results:
            if result['chunk_id'] in existing_ids:
                existing_data = [item for item in existing_data if item['chunk_id'] != result['chunk_id']]
            existing_data.append(result)
        
        with open(self.config.QA_JSON_OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, ensure_ascii=False, indent=2)
        
        print(f"QA瀵瑰凡淇濆瓨鍒? {self.config.QA_JSON_OUTPUT_PATH}")
    
    def search(self, query: str, n_results: int = 5) -> List[Dict]:
        return self.qa_vector_store.search(query, n_results)
    
    def get_stats(self) -> Dict:
        return self.qa_db.get_stats()


class AudioKnowledgeBase:
    """闊抽涓撲笟鐭ヨ瘑搴撶郴缁?""
    
    def __init__(self, config: Config = None):
        self.config = config or Config()
        self.file_db = FileRecordDB(self.config.SQLITE_DB_PATH)
        self.doc_processor = DocumentProcessor(self.config)
        self.embedding_service = EmbeddingService(self.config)
        self.vector_store = VectorStore(self.config, self.embedding_service)
        self.qa_generator = None
    
    def _init_qa_generator(self):
        if self.qa_generator is None:
            self.qa_generator = QAGenerator(self.config)
    
    def scan_documents(self) -> List[str]:
        documents = []
        doc_dir = Path(self.config.DOCUMENTS_DIR)
        
        if not doc_dir.exists():
            print(f"鏂囨。鐩綍涓嶅瓨鍦紝姝ｅ湪鍒涘缓: {doc_dir}")
            doc_dir.mkdir(parents=True, exist_ok=True)
            return documents
        
        for ext in self.config.SUPPORTED_EXTENSIONS:
            documents.extend(str(p) for p in doc_dir.rglob(f'*{ext}'))
        
        return sorted(documents)
    
    def process_documents(self, force: bool = False, force_ocr: bool = False):
        documents = self.scan_documents()
        
        if not documents:
            print("鏈壘鍒颁换浣曟枃妗?)
            return
        
        print(f"鍙戠幇 {len(documents)} 涓枃妗?)
        if force_ocr:
            print("OCR寮哄埗妯″紡: 灏嗗鎵€鏈塒DF杩涜OCR澶勭悊")
        
        processed_count = 0
        skipped_count = 0
        ocr_used = False
        
        for doc_path in documents:
            if not force and not self.file_db.needs_processing(doc_path):
                print(f"璺宠繃锛堟湭淇敼锛? {doc_path}")
                skipped_count += 1
                continue
            
            print(f"澶勭悊涓? {doc_path}")
            
            self.vector_store.delete_by_source(doc_path)
            
            chunks = self.doc_processor.process_file(doc_path, force_ocr=force_ocr)
            
            if not chunks:
                print(f"璀﹀憡: 鏂囨。鍐呭涓虹┖鎴栨棤娉曡В鏋? {doc_path}")
                continue
            
            if chunks and chunks[0].get('metadata', {}).get('ocr_used'):
                ocr_used = True
            
            self.vector_store.add_documents(chunks)
            
            file_hash = self.file_db.compute_file_hash(doc_path)
            self.file_db.upsert_file_record(doc_path, file_hash, len(chunks))
            
            print(f"瀹屾垚: {len(chunks)} 涓枃鏈潡")
            processed_count += 1
        
        print(f"\n澶勭悊瀹屾垚: 鏂板鐞?{processed_count} 涓紝璺宠繃 {skipped_count} 涓?)
        print(f"鍚戦噺搴撴€绘枃妗ｆ暟: {self.vector_store.collection.count()}")
        
        if ocr_used and self.doc_processor.ocr_processor and self.doc_processor.ocr_processor.smart_ocr:
            print("\n" + self.doc_processor.ocr_processor.get_stats_report())
    
    def generate_qa_pairs(self, force: bool = False):
        self._init_qa_generator()
        
        print("\n" + "="*60)
        print("寮€濮嬬敓鎴怮A瀵?)
        print("="*60)
        
        all_chunks = self.vector_store.get_all_chunks()
        
        if not all_chunks:
            print("鍚戦噺搴撲腑娌℃湁鏂囨。鍧楋紝璇峰厛澶勭悊鏂囨。")
            return
        
        print(f"鍚戦噺搴撲腑鍏辨湁 {len(all_chunks)} 涓枃妗ｅ潡")
        
        chunks_for_qa = []
        for chunk in all_chunks:
            chunks_for_qa.append({
                'content': chunk['content'],
                'metadata': {
                    'source': chunk['metadata'].get('source', ''),
                    'filename': chunk['metadata'].get('filename', ''),
                    'chunk_index': chunk['metadata'].get('chunk_index', 0)
                }
            })
        
        qa_results = self.qa_generator.generate_for_chunks(chunks_for_qa, force)
        
        if qa_results:
            self.qa_generator.save_qa_results(qa_results)
            print(f"\nQA瀵圭敓鎴愬畬鎴? {len(qa_results)} 涓潡锛屽叡 {sum(len(r['qa_pairs']) for r in qa_results)} 涓棶绛斿")
        else:
            print("\n娌℃湁鏂扮殑QA瀵归渶瑕佺敓鎴?)
        
        stats = self.qa_generator.get_stats()
        print(f"QA搴撶粺璁? {stats['chunk_count']} 涓潡锛寋stats['qa_count']} 涓棶绛斿")
    
    def search(self, query: str, n_results: int = 5) -> List[Dict]:
        return self.vector_store.search(query, n_results)
    
    def search_qa(self, query: str, n_results: int = 5) -> List[Dict]:
        self._init_qa_generator()
        return self.qa_generator.search(query, n_results)
    
    def print_search_results(self, results: List[Dict]):
        print("\n" + "="*60)
        print("鎼滅储缁撴灉锛堟枃妗ｅ潡锛?)
        print("="*60)
        
        for i, result in enumerate(results, 1):
            print(f"\n銆愮粨鏋?{i}銆戠浉浼煎害: {1 - result['distance']:.4f}")
            print(f"鏉ユ簮: {result['metadata'].get('filename', '鏈煡')}")
            print(f"鍐呭:\n{result['content'][:300]}...")
            print("-"*40)
    
    def print_qa_search_results(self, results: List[Dict]):
        print("\n" + "="*60)
        print("鎼滅储缁撴灉锛圦A瀵癸級")
        print("="*60)
        
        for i, result in enumerate(results, 1):
            print(f"\n銆愮粨鏋?{i}銆戠浉浼煎害: {1 - result['distance']:.4f}")
            print(f"闂: {result['question']}")
            print(f"绛旀:\n{result['answer'][:300]}...")
            print(f"鏉ユ簮: {result['metadata'].get('source_file', '鏈煡')}")
            print("-"*40)
    
    def retrieve(self, query: str, top_k: int = 5) -> List[RetrievedQA]:
        """
        妫€绱㈡渶鐩稿叧鐨凲A瀵?        
        Args:
            query: 鐢ㄦ埛闂
            top_k: 杩斿洖缁撴灉鏁伴噺
            
        Returns:
            List[RetrievedQA]: 妫€绱㈠埌鐨凲A瀵瑰垪琛?        """
        self._init_qa_generator()
        
        raw_results = self.qa_generator.search(query, n_results=top_k)
        
        retrieved_qa_list = []
        for result in raw_results:
            confidence = 1 - result.get('distance', 1.0)
            
            source_ref = SourceReference(
                document=result['metadata'].get('source_file', '鏈煡'),
                chunk_index=0,
                confidence=confidence,
                relevant_text=result['answer'][:200]
            )
            
            retrieved_qa = RetrievedQA(
                question=result.get('question', ''),
                answer=result.get('answer', ''),
                summary=result['metadata'].get('summary', ''),
                source=source_ref,
                confidence=confidence
            )
            retrieved_qa_list.append(retrieved_qa)
        
        return retrieved_qa_list
    
    def retrieve_chunks(self, query: str, top_k: int = 3) -> List[Dict]:
        """
        妫€绱㈡渶鐩稿叧鐨勬枃妗ｅ潡
        
        Args:
            query: 鐢ㄦ埛闂
            top_k: 杩斿洖缁撴灉鏁伴噺
            
        Returns:
            List[Dict]: 妫€绱㈠埌鐨勬枃妗ｅ潡鍒楄〃
        """
        return self.vector_store.search(query, n_results=top_k)
    
    def generate_answer(
        self, 
        query: str, 
        conversation_history: List[Message] = None,
        top_k: int = 5
    ) -> AnswerResult:
        """
        妫€绱㈢浉鍏冲唴瀹瑰苟鐢熸垚鏈€缁堝洖绛?        
        Args:
            query: 鐢ㄦ埛闂
            conversation_history: 瀵硅瘽鍘嗗彶锛堟敮鎸佸杞璇濓級
            top_k: 妫€绱㈢殑QA瀵规暟閲?            
        Returns:
            AnswerResult: 鐢熸垚鐨勭瓟妗堢粨鏋滐紙鍖呭惈鏉ユ簮鍜岀疆淇″害锛?        """
        self._init_qa_generator()
        
        retrieved_qa = self.retrieve(query, top_k=top_k)
        
        retrieved_chunks = self.retrieve_chunks(query, top_k=3)
        
        if not retrieved_qa and not retrieved_chunks:
            return AnswerResult(
                text="鎶辨瓑锛屾垜鍦ㄧ煡璇嗗簱涓病鏈夋壘鍒扮浉鍏充俊鎭潵鍥炵瓟鎮ㄧ殑闂銆?,
                sources=[],
                confidence=0.0
            )
        
        context_parts = []
        sources_set = set()
        source_details = []
        
        for qa in retrieved_qa:
            context_parts.append(f"銆愮浉鍏抽棶绛斻€慭n闂: {qa.question}\n绛旀: {qa.answer}")
            if qa.source:
                sources_set.add(str(qa.source))
                source_details.append(qa.source)
        
        for chunk in retrieved_chunks:
            content = chunk.get('content', '')
            filename = chunk.get('metadata', {}).get('filename', '鏈煡')
            confidence = 1 - chunk.get('distance', 1.0)
            context_parts.append(f"銆愮浉鍏虫枃妗ｇ墖娈点€慭n鏉ユ簮: {filename}\n鍐呭: {content}")
            
            source_ref = SourceReference(
                document=filename,
                chunk_index=chunk.get('metadata', {}).get('chunk_index', 0),
                confidence=confidence,
                relevant_text=content[:200]
            )
            sources_set.add(str(source_ref))
            source_details.append(source_ref)
        
        context = "\n\n".join(context_parts)
        
        history_text = ""
        if conversation_history:
            history_parts = []
            for msg in conversation_history[-5:]:
                role_name = "鐢ㄦ埛" if msg.role == "user" else "鍔╂墜"
                history_parts.append(f"{role_name}: {msg.content}")
            history_text = "\n銆愬璇濆巻鍙层€慭n" + "\n".join(history_parts) + "\n\n"
        
        prompt = f"""浣犳槸涓€涓笓涓氱殑闊抽鐭ヨ瘑鍔╂墜銆傝鏍规嵁浠ヤ笅妫€绱㈠埌鐨勭煡璇嗗簱鍐呭锛屽洖绛旂敤鎴风殑闂銆?
瑕佹眰锛?1. 鍥炵瓟瑕佸噯纭€佷笓涓氥€佹湁鏉＄悊
2. 濡傛灉鐭ヨ瘑搴撲腑鏈夌浉鍏充俊鎭紝璇风患鍚堜娇鐢?3. 濡傛灉鐭ヨ瘑搴撲腑娌℃湁鐩稿叧淇℃伅锛岃璇氬疄璇存槑
4. 鍥炵瓟鏃跺彲浠ュ紩鐢ㄥ叿浣撶殑鏉ユ簮鏂囨。

{history_text}銆愮煡璇嗗簱鍐呭銆?{context}

銆愮敤鎴烽棶棰樸€?{query}

璇风粰鍑轰笓涓氥€佸噯纭殑鍥炵瓟锛?""

        try:
            if self.config.LLM_TYPE == "deepseek":
                api_key = self.config.DEEPSEEK_API_KEY or os.getenv("DEEPSEEK_API_KEY")
                if not api_key:
                    raise ValueError("DEEPSEEK_API_KEY鐜鍙橀噺鏈缃€傝鍦ㄧ幆澧冨彉閲忎腑璁剧疆鏈夋晥鐨凞eepSeek API瀵嗛挜銆?)
                client = OpenAI(
                    api_key=api_key,
                    base_url=self.config.DEEPSEEK_BASE_URL,
                    http_client=httpx.Client(trust_env=False)
                )
            else:
                api_key = self.config.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY鐜鍙橀噺鏈缃€傝鍦ㄧ幆澧冨彉閲忎腑璁剧疆鏈夋晥鐨凮penAI API瀵嗛挜銆?)
                client = OpenAI(
                    api_key=api_key,
                    base_url=self.config.OPENAI_BASE_URL,
                    http_client=httpx.Client(trust_env=False)
                )
            
            response = client.chat.completions.create(
                model=self.config.LLM_MODEL,
                messages=[
                    {"role": "system", "content": "浣犳槸涓€涓笓涓氱殑闊抽鐭ヨ瘑鍔╂墜锛屾搮闀垮洖绛旈煶棰戝伐绋嬨€侀煶涔愬埗浣溿€佸０瀛︾瓑鏂归潰鐨勯棶棰樸€?},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=self.config.LLM_MAX_TOKENS,
                temperature=0.7
            )
            
            answer_text = response.choices[0].message.content.strip()
            
        except Exception as e:
            if retrieved_qa:
                answer_text = retrieved_qa[0].answer
                if len(retrieved_qa) > 1:
                    answer_text += f"\n\n琛ュ厖淇℃伅锛歿retrieved_qa[1].answer}"
            else:
                answer_text = "鎶辨瓑锛岀敓鎴愬洖绛旀椂鍑虹幇閿欒锛岃绋嶅悗閲嶈瘯銆?
        
        avg_confidence = sum(qa.confidence for qa in retrieved_qa) / len(retrieved_qa) if retrieved_qa else 0.0
        
        return AnswerResult(
            text=answer_text,
            sources=list(sources_set),
            source_details=source_details,
            confidence=avg_confidence,
            retrieved_qa=retrieved_qa
        )
    
    def chat(
        self, 
        query: str, 
        conversation_history: List[Dict] = None
    ) -> AnswerResult:
        """
        澶氳疆瀵硅瘽鎺ュ彛
        
        Args:
            query: 鐢ㄦ埛闂
            conversation_history: 瀵硅瘽鍘嗗彶锛堝瓧鍏稿垪琛紝鏍煎紡: [{"role": "user/assistant", "content": "..."}]锛?            
        Returns:
            AnswerResult: 鐢熸垚鐨勭瓟妗堢粨鏋?        """
        messages = None
        if conversation_history:
            messages = [Message(role=m['role'], content=m['content']) for m in conversation_history]
        
        return self.generate_answer(query, conversation_history=messages)
    
    def get_context_for_agent(self, query: str, top_k: int = 5) -> Dict:
        """
        涓篈gent鎻愪緵涓婁笅鏂囦俊鎭?        
        Args:
            query: 鐢ㄦ埛闂
            top_k: 妫€绱㈡暟閲?            
        Returns:
            Dict: 鍖呭惈涓婁笅鏂囦俊鎭殑瀛楀吀锛岄€傚悎Agent璋冪敤
        """
        retrieved_qa = self.retrieve(query, top_k=top_k)
        retrieved_chunks = self.retrieve_chunks(query, top_k=3)
        
        context = {
            'query': query,
            'qa_pairs': [qa.to_dict() for qa in retrieved_qa],
            'documents': [
                {
                    'content': chunk.get('content', ''),
                    'source': chunk.get('metadata', {}).get('filename', '鏈煡'),
                    'confidence': 1 - chunk.get('distance', 1.0)
                }
                for chunk in retrieved_chunks
            ],
            'sources': list(set(qa.source.document for qa in retrieved_qa if qa.source)),
            'avg_confidence': sum(qa.confidence for qa in retrieved_qa) / len(retrieved_qa) if retrieved_qa else 0.0
        }
        
        return context


class KnowledgeBaseAPI:
    """
    鐭ヨ瘑搴揂PI鎺ュ彛绫?    涓撻棬涓篛penClaw Agent璁捐锛屾彁渚涚畝娲佺殑璋冪敤鎺ュ彛
    """
    
    def __init__(self, config: Config = None):
        self._kb = AudioKnowledgeBase(config)
        self._conversation_history: List[Message] = []
    
    def retrieve(self, query: str, top_k: int = 5) -> List[RetrievedQA]:
        """妫€绱㈡渶鐩稿叧鐨凲A瀵?""
        return self._kb.retrieve(query, top_k)
    
    def generate_answer(self, query: str, top_k: int = 5) -> AnswerResult:
        """
        鐢熸垚绛旀锛堜笉甯﹀璇濆巻鍙诧級
        
        绀轰緥:
            kb = KnowledgeBaseAPI()
            answer = kb.generate_answer("鍘嬬缉鍣ㄥ簲璇ユ€庝箞璁剧疆锛?)
            print(answer.text)
            print(answer.sources)
        """
        return self._kb.generate_answer(query, top_k=top_k)
    
    def chat(self, query: str) -> AnswerResult:
        """
        澶氳疆瀵硅瘽锛堣嚜鍔ㄧ淮鎶ゅ璇濆巻鍙诧級
        
        绀轰緥:
            kb = KnowledgeBaseAPI()
            answer1 = kb.chat("浠€涔堟槸鍘嬬缉鍣紵")
            answer2 = kb.chat("閭ｅ畠鐨刟ttack鍙傛暟鎬庝箞璁剧疆锛?)  # 浼氬甫涓婁箣鍓嶇殑瀵硅瘽涓婁笅鏂?        """
        result = self._kb.generate_answer(
            query, 
            conversation_history=self._conversation_history
        )
        
        self._conversation_history.append(Message(role='user', content=query))
        self._conversation_history.append(Message(role='assistant', content=result.text))
        
        if len(self._conversation_history) > 20:
            self._conversation_history = self._conversation_history[-20:]
        
        return result
    
    def clear_history(self):
        """娓呴櫎瀵硅瘽鍘嗗彶"""
        self._conversation_history = []
    
    def get_context(self, query: str, top_k: int = 5) -> Dict:
        """鑾峰彇涓婁笅鏂囦俊鎭紙渚汚gent浣跨敤锛?""
        return self._kb.get_context_for_agent(query, top_k)

    def search(self, query: str, top_k: int = 5, search_type: str = "qa") -> List[Dict]:
        """
        搜索文档或 QA 对
        
        Args:
            query: 搜索查询
            top_k: 返回结果数量
            search_type: 搜索类型 - "qa"(QA 对) 或 "chunk"(文档块)
        
        Returns:
            List[Dict]: 搜索结果列表
        """
        if search_type == "chunk":
            return self._kb.search(query, n_results=top_k)
        else:
            return self._kb.search_qa(query, n_results=top_k)

    def search(self, query: str, top_k: int = 5, search_type: str = "qa") -> List[Dict]:
        """
        搜索文档或 QA 对
        
        Args:
            query: 搜索查询
            top_k: 返回结果数量
            search_type: 搜索类型 - "qa"(QA 对) 或 "chunk"(文档块)
        
        Returns:
            List[Dict]: 搜索结果列表
        """
        if search_type == "chunk":
            return self._kb.search(query, n_results=top_k)
        else:
            return self._kb.search_qa(query, n_results=top_k)
    
    def process_documents(self, force: bool = False, force_ocr: bool = False):
        """澶勭悊鏂囨。"""
        self._kb.process_documents(force, force_ocr)
    
    def generate_qa_pairs(self, force: bool = False):
        """鐢熸垚QA瀵?""
        self._kb.generate_qa_pairs(force)
    
    def full_pipeline(self, force: bool = False):
        """杩愯瀹屾暣娴佹按绾?""
        self._kb.process_documents(force)
        self._kb.generate_qa_pairs(force)


def interactive_mode(kb: AudioKnowledgeBase, use_qa: bool = False):
    print("\n" + "="*60)
    print("闊抽涓撲笟鐭ヨ瘑搴?- 浜や簰寮忔煡璇?)
    print("杈撳叆闂杩涜鏌ヨ锛岃緭鍏?'quit' 鎴?'exit' 閫€鍑?)
    print("="*60)
    
    while True:
        try:
            query = input("\n璇疯緭鍏ラ棶棰? ").strip()
            
            if query.lower() in ['quit', 'exit', 'q']:
                print("鍐嶈锛?)
                break
            
            if not query:
                continue
            
            if use_qa:
                results = kb.search_qa(query, n_results=3)
                kb.print_qa_search_results(results)
            else:
                results = kb.search(query, n_results=3)
                kb.print_search_results(results)
            
        except KeyboardInterrupt:
            print("\n鍐嶈锛?)
            break
        except Exception as e:
            print(f"閿欒: {e}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='闊抽涓撲笟鐭ヨ瘑搴撶郴缁?)
    parser.add_argument('--docs-dir', default='./documents', help='鏂囨。鐩綍')
    parser.add_argument('--force', action='store_true', help='寮哄埗閲嶆柊澶勭悊鎵€鏈夋枃妗?)
    parser.add_argument('--force-ocr', action='store_true', help='寮哄埗瀵规墍鏈塒DF杩涜OCR澶勭悊锛堢敤浜庢壂鎻忎欢锛?)
    parser.add_argument('--ocr-mode', type=str, default='smart',
                        choices=['paddle_only', 'deepseek_only', 'smart'],
                        help='OCR妯″紡锛歱addle_only锛堝叏鍏嶈垂锛夛紝deepseek_only锛堝叏API锛夛紝smart锛堟櫤鑳介檷绾э級')
    parser.add_argument('--ocr-quality-threshold', type=float, default=0.85,
                        help='璇嗗埆璐ㄩ噺闃堝€硷紝浣庝簬姝ゅ€艰Е鍙慉PI淇濆簳锛坰mart妯″紡涓嬶級')
    parser.add_argument('--save-ocr-stats', action='store_true',
                        help='淇濆瓨OCR缁熻淇℃伅锛屼究浜庡垎鏋愬摢浜涗功闇€瑕丄PI淇濆簳')
    parser.add_argument('--no-ocr', action='store_true', help='绂佺敤OCR鍔熻兘')
    parser.add_argument('--search', type=str, help='鎼滅储鏌ヨ锛堟枃妗ｅ潡锛?)
    parser.add_argument('--search-qa', type=str, help='鎼滅储鏌ヨ锛圦A瀵癸級')
    parser.add_argument('--ask', type=str, help='鐢熸垚绛旀锛堝甫鏉ユ簮寮曠敤锛?)
    parser.add_argument('--chat', action='store_true', help='澶氳疆瀵硅瘽妯″紡')
    parser.add_argument('--interactive', '-i', action='store_true', help='浜や簰寮忔煡璇㈡ā寮?)
    parser.add_argument('--interactive-qa', action='store_true', help='浜や簰寮廞A鏌ヨ妯″紡')
    parser.add_argument('--embedding-type', choices=['local', 'deepseek', 'openai'], 
                        default='local', help='Embedding绫诲瀷')
    parser.add_argument('--llm-type', choices=['deepseek', 'openai'], 
                        default='deepseek', help='LLM绫诲瀷锛堢敤浜嶲A鐢熸垚锛?)
    parser.add_argument('--generate-qa', action='store_true', help='鐢熸垚QA瀵?)
    parser.add_argument('--full-pipeline', action='store_true', help='杩愯瀹屾暣娴佹按绾匡紙鏂囨。澶勭悊 + QA鐢熸垚锛?)
    
    args = parser.parse_args()
    
    config = Config()
    config.DOCUMENTS_DIR = args.docs_dir
    config.EMBEDDING_TYPE = args.embedding_type
    config.LLM_TYPE = args.llm_type
    config.OCR_MODE = args.ocr_mode
    config.OCR_QUALITY_THRESHOLD = args.ocr_quality_threshold
    config.OCR_SAVE_STATS = args.save_ocr_stats
    
    if args.ocr_mode == 'paddle_only':
        config.OCR_API_FALLBACK = False
    elif args.ocr_mode == 'deepseek_only':
        config.OCR_API_FALLBACK = True
        config.OCR_QUALITY_THRESHOLD = 1.0
    
    if args.no_ocr:
        config.OCR_ENABLED = False
    
    print("="*60)
    print("闊抽涓撲笟鐭ヨ瘑搴撶郴缁?)
    print("="*60)
    print(f"鏂囨。鐩綍: {config.DOCUMENTS_DIR}")
    print(f"鍚戦噺鏁版嵁搴? {config.CHROMA_DB_PATH}")
    print(f"璁板綍鏁版嵁搴? {config.SQLITE_DB_PATH}")
    print(f"QA鏁版嵁搴? {config.QA_SQLITE_DB_PATH}")
    print(f"QA鍚戦噺搴? {config.QA_CHROMA_DB_PATH}")
    print(f"鍒嗗潡澶у皬: {config.CHUNK_SIZE} 瀛楃")
    print(f"閲嶅彔澶у皬: {config.CHUNK_OVERLAP} 瀛楃")
    print(f"Embedding绫诲瀷: {config.EMBEDDING_TYPE}")
    print(f"LLM绫诲瀷: {config.LLM_TYPE}")
    ocr_info = f"{config.OCR_MODE}妯″紡" if config.OCR_ENABLED else "绂佺敤"
    if config.OCR_ENABLED and config.OCR_API_FALLBACK:
        ocr_info += f" (璐ㄩ噺闃堝€? {config.OCR_QUALITY_THRESHOLD:.0%})"
    print(f"OCR: {ocr_info}")
    print("="*60)
    
    kb = AudioKnowledgeBase(config)
    
    if args.full_pipeline:
        kb.process_documents(force=args.force, force_ocr=args.force_ocr)
        kb.generate_qa_pairs(force=args.force)
    elif args.generate_qa:
        kb.generate_qa_pairs(force=args.force)
    elif args.ask:
        answer = kb.generate_answer(args.ask)
        print("\n" + "="*60)
        print("鍥炵瓟")
        print("="*60)
        print(answer.text)
        if answer.sources:
            print(f"\n馃摎 鏉ユ簮: {', '.join(answer.sources)}")
        print(f"馃搳 缃俊搴? {answer.confidence:.2%}")
    elif args.chat:
        api = KnowledgeBaseAPI(config)
        print("\n" + "="*60)
        print("澶氳疆瀵硅瘽妯″紡")
        print("杈撳叆闂杩涜瀵硅瘽锛岃緭鍏?'quit' 鎴?'exit' 閫€鍑猴紝杈撳叆 'clear' 娓呴櫎鍘嗗彶")
        print("="*60)
        
        while True:
            try:
                query = input("\n鐢ㄦ埛: ").strip()
                
                if query.lower() in ['quit', 'exit', 'q']:
                    print("鍐嶈锛?)
                    break
                
                if query.lower() == 'clear':
                    api.clear_history()
                    print("瀵硅瘽鍘嗗彶宸叉竻闄?)
                    continue
                
                if not query:
                    continue
                
                answer = api.chat(query)
                print(f"\n鍔╂墜: {answer.text}")
                if answer.sources:
                    print(f"馃摎 鏉ユ簮: {', '.join(answer.sources)}")
                    
            except KeyboardInterrupt:
                print("\n鍐嶈锛?)
                break
            except Exception as e:
                print(f"閿欒: {e}")
    elif args.search:
        results = kb.search(args.search)
        kb.print_search_results(results)
    elif args.search_qa:
        results = kb.search_qa(args.search_qa)
        kb.print_qa_search_results(results)
    elif args.interactive_qa:
        kb.process_documents()
        interactive_mode(kb, use_qa=True)
    elif args.interactive:
        kb.process_documents()
        interactive_mode(kb, use_qa=False)
    else:
        kb.process_documents(force=args.force, force_ocr=args.force_ocr)


def demo_agent_usage():
    """
    Agent璋冪敤绀轰緥
    灞曠ず濡備綍鍦∣penClaw Agent涓娇鐢ㄧ煡璇嗗簱
    """
    
    # 鏂瑰紡1: 浣跨敤KnowledgeBaseAPI锛堟帹鑽愶級
    kb = KnowledgeBaseAPI()
    
    # 妫€绱A瀵?    qa_pairs = kb.retrieve("鍘嬬缉鍣ㄥ簲璇ユ€庝箞璁剧疆锛?, top_k=3)
    for qa in qa_pairs:
        print(f"Q: {qa.question}")
        print(f"A: {qa.answer}")
        print(f"鏉ユ簮: {qa.source}")
        print(f"缃俊搴? {qa.confidence:.2%}")
        print("-" * 40)
    
    # 鐢熸垚绛旀锛堝甫鏉ユ簮锛?    answer = kb.generate_answer("鍘嬬缉鍣ㄥ簲璇ユ€庝箞璁剧疆锛?)
    print(answer.text)
    print(f"鏉ユ簮: {answer.sources}")
    print(f"缃俊搴? {answer.confidence:.2%}")
    
    # 澶氳疆瀵硅瘽
    answer1 = kb.chat("浠€涔堟槸鍘嬬缉鍣紵")
    print(answer1.text)
    
    answer2 = kb.chat("閭ttack鍙傛暟鎬庝箞璁剧疆锛?)
    print(answer2.text)
    
    # 鑾峰彇涓婁笅鏂囷紙渚汚gent鍐崇瓥浣跨敤锛?    context = kb.get_context("EQ鍧囪　鍣ㄥ浣曚娇鐢紵")
    print(context['qa_pairs'])
    print(context['documents'])
    print(context['sources'])
    
    # 鏂瑰紡2: 鐩存帴浣跨敤AudioKnowledgeBase
    kb2 = AudioKnowledgeBase()
    
    # 甯﹀璇濆巻鍙茬殑鐢熸垚
    history = [
        Message(role='user', content='浠€涔堟槸鍘嬬缉鍣紵'),
        Message(role='assistant', content='鍘嬬缉鍣ㄦ槸涓€绉嶅姩鎬佸鐞嗗伐鍏?..')
    ]
    answer = kb2.generate_answer("閭elease鍙傛暟鍛紵", conversation_history=history)
    print(answer.text)
    
    # 鏂瑰紡3: 鑾峰彇缁撴瀯鍖栦笂涓嬫枃锛堥€傚悎Function Calling锛?    context = kb2.get_context_for_agent("濡備綍娑堥櫎榻块煶锛?)
    
    # 杩斿洖缁橝gent鐨勭粨鏋勫寲鏁版嵁
    return {
        'answer': answer.to_dict(),
        'context': context
    }


if __name__ == "__main__":
    main()

