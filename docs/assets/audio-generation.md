# Nebula Cruise audio generation

Run every command below from the repository root on macOS. The committed soundtrack is deterministically rendered from `assets/audio/source/nebula-cruise-score.json` by `tools/generate-music.js`. Its fixed seed produces three stereo 16-bit PCM WAVs at 44.1 kHz with exactly 2646000 source frames each: exactly 60 seconds at 144 BPM.

## 1. Create one isolated WAV render

Declare one temporary work directory and render the WAV source set exactly once. Use the resulting `wav` child for every OGG and MP3 output, so both codec sets remain synchronized.

```bash
AUDIO_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-audio.XXXXXX")"
WAV_DIR="$AUDIO_WORK_DIR/wav"
CANDIDATE_DIR="$AUDIO_WORK_DIR/candidate"
mkdir -p "$WAV_DIR" "$CANDIDATE_DIR"
node tools/generate-music.js assets/audio/source/nebula-cruise-score.json "$WAV_DIR"
```

The renderer JSON must report `frames: 2646000`, `sampleRate: 44100`, and the declared `WAV_DIR`. The fixed 144 BPM score and deterministic WAV SHA-256 values are:

| Stem | WAV SHA-256 |
| --- | --- |
| atmosphere | `d9b4c0ff1c6bfc35af2876407ceed7d2bd13f460db1ccbc248a44d51f2343316` |
| drive | `4045c107f2881e80707eed495b51f3c937ca58e8034fd376138f4a1afcfd94c9` |
| overdrive | `75be9656d24a12a5e99cd0ba52d04d5a3d5cb2fcef5a2147b26be9a86fbe126f` |

Omitting the output argument is also safe: the generator defaults to `${TMPDIR:-/tmp}/nebula-cruise-wav-render`, outside the repository.

## 2. Preferred macOS conversion

First try the system converter into `CANDIDATE_DIR`:

```bash
for stem in atmosphere drive overdrive; do
  afconvert -f Oggf -d vorb \
    "$WAV_DIR/$stem.wav" "$CANDIDATE_DIR/nebula-cruise-$stem.ogg"
  afconvert -f MPG3 -d .mp3 -b 192000 \
    "$WAV_DIR/$stem.wav" "$CANDIDATE_DIR/nebula-cruise-$stem.mp3"
done
```

On the macOS installation used for this 2026-08-03 render, both conversions returned `ExtAudioFileSetProperty ('cfmt') failed ('fmt?')`. If that occurs, use only the pinned temporary FFmpeg fallback below.

## 3. Pinned FFmpeg fallback

Acquire exactly `@ffmpeg-installer/darwin-arm64@4.1.5` in the temporary work directory. Its npm tarball SHA-1 must be `b7b5c262dd96d1aea4807514e1cdcf6e11f82743`; the verified package contains FFmpeg 4.4. Do not install the package as a repository dependency or copy its executable into the repository.

```bash
npm pack @ffmpeg-installer/darwin-arm64@4.1.5 --pack-destination "$AUDIO_WORK_DIR"
FFMPEG_TARBALL="$AUDIO_WORK_DIR/ffmpeg-installer-darwin-arm64-4.1.5.tgz"
printf '%s  %s\n' \
  'b7b5c262dd96d1aea4807514e1cdcf6e11f82743' "$FFMPEG_TARBALL" \
  | shasum -a 1 -c -
FFMPEG_PACKAGE_DIR="$AUDIO_WORK_DIR/ffmpeg-installer"
mkdir -p "$FFMPEG_PACKAGE_DIR"
tar -xzf "$FFMPEG_TARBALL" -C "$FFMPEG_PACKAGE_DIR" --strip-components=1
FFMPEG_BIN="$FFMPEG_PACKAGE_DIR/ffmpeg"
test -x "$FFMPEG_BIN"
"$FFMPEG_BIN" -version | sed -n '1p'

for stem in atmosphere drive overdrive; do
  "$FFMPEG_BIN" -hide_banner -loglevel error -y \
    -i "$WAV_DIR/$stem.wav" -c:a libvorbis -q:a 5 \
    "$CANDIDATE_DIR/nebula-cruise-$stem.ogg"
  "$FFMPEG_BIN" -hide_banner -loglevel error -y \
    -i "$WAV_DIR/$stem.wav" -c:a libmp3lame -b:a 192k \
    "$CANDIDATE_DIR/nebula-cruise-$stem.mp3"
done
```

## 4. Verify and replace the committed codecs

Check every temporary candidate before copying it over its matching committed asset. The measurements below are from the actual 2026-08-03 codec outputs. Within each codec, all siblings agree within 1 ms. MP3 duration includes codec priming and remainder.

| Output | Codec duration (seconds) | SHA-256 |
| --- | ---: | --- |
| `assets/audio/nebula-cruise-atmosphere.ogg` | 60.000000 | `c08808afe852ad2fc6d0c33d04ca1898711895e2b83bbd7ce77350570db24eaf` |
| `assets/audio/nebula-cruise-drive.ogg` | 60.000000 | `89d2e0258a6497267743da1416f1ca4d6a7f6aabb1bd28a7edda44b5ccdadf0e` |
| `assets/audio/nebula-cruise-overdrive.ogg` | 60.000000 | `584fb8c0e08187a90339df843be73f2a421247c5f3c920e2d49cc61142d191d6` |
| `assets/audio/nebula-cruise-atmosphere.mp3` | 60.029388 | `664986af51147374ed093a626eb63328be8f94fbf99ee7228e43605546b0de1f` |
| `assets/audio/nebula-cruise-drive.mp3` | 60.029388 | `a462b0541cd4860d443e32e2755d8dbfa8c383c556ee267ad746c75ae5445655` |
| `assets/audio/nebula-cruise-overdrive.mp3` | 60.029388 | `b88afe29bc54a5d017341de32d2c023a02ed9d7b2576f87ab59ad67e54484e1d` |

The normal run mix (atmosphere 0.48, drive 1, overdrive 0.42, bus gain 0.55) measures a pre-codec peak of `0.5873410285115243`. The intense mix (atmosphere 0.42, drive 1, overdrive 0.90, bus gain 0.55) measures `0.691980462981388`, leaving `0.308019537018612` linear headroom to full scale and remaining below the `0.95` guardrail.

```bash
for file in "$CANDIDATE_DIR"/nebula-cruise-*; do
  afinfo "$file" | awk -v file="$file" \
    '/estimated duration/ { print file "\t" $3 " seconds" }'
done
shasum -a 256 "$CANDIDATE_DIR"/nebula-cruise-*
```

Only after every SHA-256 matches this table, copy the verified candidates to their like-named paths under `assets/audio/`.

## 5. Two-loop audition procedure

The two-loop audition procedure is the approval gate before committing these files.

1. Play each candidate format for two complete 60-second loops. Confirm no seam, click, or timing drift at either loop boundary.
2. Serve the repository over HTTP, open the game menu, start a normal run, then compare the intense mix by either triggering BOOST or playing until the speed ratio reaches `0.75`.
3. Confirm that starting a run replaces the cinematic menu bed with four-on-the-floor kick, eighth-note bass, and continuous sixteenth-note percussion within 300 ms. The intense layer begins at 55% speed (about 13 seconds into an uninterrupted run), or immediately during danger or BOOST.
4. Confirm a clear pulse within two seconds, a joyful fast slightly-tense feel, an obvious smooth intensity lift, audible SFX, and a seamless two-loop result. Any requested musical revision requires rerunning the score/generator checks and regenerating all six outputs with updated hashes.

## 6. Safely remove temporary files

After approval or rejection, validate that the directory still has the expected `mktemp` prefix before deleting it:

```bash
AUDIO_TEMP_ROOT="${TMPDIR:-/tmp}"
case "$AUDIO_WORK_DIR" in
  "$AUDIO_TEMP_ROOT"/nebula-cruise-audio.*)
    find "$AUDIO_WORK_DIR" -depth -mindepth 1 -delete
    rmdir "$AUDIO_WORK_DIR"
    ;;
  *)
    printf 'Refusing to delete unexpected path: %s\n' "$AUDIO_WORK_DIR" >&2
    false
    ;;
esac
```
