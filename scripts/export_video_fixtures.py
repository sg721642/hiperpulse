#!/usr/bin/env python3
"""Generate deterministic synthetic video fixtures for HiperPulse M2 testing.

Outputs:
  - samples/test_video_30s.webm (30s constant 30fps, 72 BPM periodicity, 0 gaps)
  - samples/test_video_12s.webm (12s constant 30fps, 72 BPM periodicity, fails only duration gate)
  - samples/test_video_gapped.webm (30s with a deliberate 7.0s timestamp gap at 5s)
  - samples/test_video_30s.mp4 (H.264 version of 30s video)
  - samples/test_video_12s.mp4 (H.264 version of 12s video)
"""
from pathlib import Path
import subprocess
import numpy as np

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / 'samples'
SAMPLES.mkdir(exist_ok=True)


def generate_constant_video(output_path: Path, duration: float, fps: int = 30, codec: str = 'libvpx'):
    """Generate a constant frame-rate synthetic facial video with 72 BPM cheek pulse."""
    width, height = 320, 240
    total_frames = int(round(fps * duration))

    # Normalized patch bounds matching web/app.js:
    # Left: x=32%, y=48%, w=12%, h=12% -> x:102..140, y:115..144
    # Right: x=56%, y=48%, w=12%, h=12% -> x:179..217, y:115..144
    x1, w1 = int(round(width * 0.32)), int(round(width * 0.12))
    x2, w2 = int(round(width * 0.56)), int(round(width * 0.12))
    y, h = int(round(height * 0.48)), int(round(height * 0.12))

    cmd = [
        FFMPEG, '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{width}x{height}',
        '-pix_fmt', 'rgb24',
        '-r', str(fps),
        '-i', '-',
        '-c:v', codec,
        '-r', str(fps),
    ]
    if codec == 'libvpx':
        cmd.extend(['-b:v', '800k', '-crf', '10', '-g', str(fps), '-keyint_min', str(fps)])
    elif codec == 'libx264':
        cmd.extend(['-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '18', '-g', str(fps)])

    cmd.append(str(output_path))

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    rng = np.random.default_rng(42)

    for i in range(total_frames):
        t = i / fps
        p = np.sin(2 * np.pi * 1.2 * t) + 0.15 * np.sin(2 * np.pi * 2.4 * t)
        
        # Face background
        frame = np.full((height, width, 3), [115, 100, 85], dtype=np.uint8)

        # Left cheek: 110 + 1.2*p + low noise
        g_left = np.clip(110 + 1.2 * p + rng.normal(0, 0.05), 0, 255)
        frame[y:y+h, x1:x1+w1, 0] = int(round(g_left * 0.9))
        frame[y:y+h, x1:x1+w1, 1] = int(round(g_left))
        frame[y:y+h, x1:x1+w1, 2] = int(round(g_left * 0.75))

        # Right cheek: 108 + 1.1*p + low noise
        g_right = np.clip(108 + 1.1 * p + rng.normal(0, 0.05), 0, 255)
        frame[y:y+h, x2:x2+w2, 0] = int(round(g_right * 0.9))
        frame[y:y+h, x2:x2+w2, 1] = int(round(g_right))
        frame[y:y+h, x2:x2+w2, 2] = int(round(g_right * 0.75))

        proc.stdin.write(frame.tobytes())

    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg failed ({proc.returncode}): {proc.stderr.read().decode('utf-8', errors='replace')}")


def generate_gapped_video(input_path: Path, output_path: Path):
    """Generate a video with 25s total content and a deliberate 2.0-second timestamp gap at 12s."""
    filter_complex = '[0:v]trim=0:12,setpts=PTS-STARTPTS[v1];[0:v]trim=12:25,setpts=PTS-STARTPTS+14.0/TB[v2];[v1][v2]concat=n=2:v=1[outv]'
    cmd = [
        FFMPEG, '-y',
        '-i', str(input_path),
        '-filter_complex', filter_complex,
        '-map', '[outv]',
        '-c:v', 'libvpx',
        '-b:v', '800k',
        '-crf', '10',
        str(output_path)
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main():
    print("Generating samples/test_video_30s.webm (30s, 30fps)...")
    generate_constant_video(SAMPLES / 'test_video_30s.webm', duration=30.0, fps=30, codec='libvpx')
    
    print("Generating samples/test_video_12s.webm (12s, 30fps)...")
    generate_constant_video(SAMPLES / 'test_video_12s.webm', duration=12.0, fps=30, codec='libvpx')
    
    print("Generating samples/test_video_gapped.webm (27s with deliberate 2s gap at 12s)...")
    generate_gapped_video(SAMPLES / 'test_video_30s.webm', SAMPLES / 'test_video_gapped.webm')

    print("Generating samples/test_video_30s.mp4 (H.264 version)...")
    generate_constant_video(SAMPLES / 'test_video_30s.mp4', duration=30.0, fps=30, codec='libx264')

    print("Generating samples/test_video_12s.mp4 (H.264 version)...")
    generate_constant_video(SAMPLES / 'test_video_12s.mp4', duration=12.0, fps=30, codec='libx264')

    print("All video fixtures generated successfully.")
    import runpy
    runpy.run_path(str(ROOT / 'scripts' / 'build_manifest.py'), run_name='__main__')


if __name__ == '__main__':
    main()
