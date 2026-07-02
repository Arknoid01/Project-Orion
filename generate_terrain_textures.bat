@echo off
REM Lance le batch textures terrain SDXL (PAS comfy_batch_generate.py)
cd /d "%~dp0"
python tools\comfy_terrain_batch.py %*
