#!/usr/bin/env python3
# CosyVoice 批量配音(给 build.mjs 调):一次加载模型,克隆 prompt 声线读多段中文
# 用: <conda-python> cosyvoice_batch.py <req.json>   (仓库路径可用 COSYVOICE_REPO 覆盖)
# req.json = {"texts":[...], "prompt":"/abs/prompt.wav", "outdir":"/abs/dir"} -> outdir/vo-01.wav ...
import sys, json, os
ROOT = os.environ.get('COSYVOICE_REPO') or os.path.expanduser('~/CosyVoice')  # 自有克隆路径用 COSYVOICE_REPO 覆盖
sys.path.append(os.path.join(ROOT, 'third_party/Matcha-TTS')); sys.path.append(ROOT)
from cosyvoice.cli.cosyvoice import CosyVoice2
import torchaudio

req = json.load(open(sys.argv[1], encoding='utf-8'))
MODEL = os.path.join(ROOT, 'pretrained_models/CosyVoice2-0.5B')
os.makedirs(req['outdir'], exist_ok=True)

cv = CosyVoice2(MODEL, load_jit=False, load_trt=False, fp16=False)
sr = cv.sample_rate
for i, txt in enumerate(req['texts']):
    done = False
    for out in cv.inference_cross_lingual(txt, req['prompt'], stream=False):
        torchaudio.save(os.path.join(req['outdir'], f'vo-{i+1:02d}.wav'), out['tts_speech'], sr)
        done = True
        break
    print(f'vo-{i+1:02d} {"ok" if done else "FAIL"}', flush=True)
    if not done:
        sys.exit(11)
print('COSY_BATCH_DONE', flush=True)
