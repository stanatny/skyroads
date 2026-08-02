# Nebula Cruise audio generation

Run every command below from the repository root on macOS. The committed soundtrack is rendered from `assets/audio/source/nebula-cruise-score.json` by `tools/generate-music.js`. Its fixed seed produces three stereo 16-bit PCM WAVs at 44.1 kHz with exactly 3,024,000 frames each.

## 1. Create an isolated WAV render

Declare one temporary work directory and use its `wav` child in every later command:

```bash
AUDIO_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nebula-cruise-audio.XXXXXX")"
WAV_DIR="$AUDIO_WORK_DIR/wav"
mkdir -p "$WAV_DIR"
node tools/generate-music.js assets/audio/source/nebula-cruise-score.json "$WAV_DIR"
```

The renderer's JSON result must report `frames: 3024000`, `sampleRate: 44100`, and the declared `WAV_DIR`. Omitting the output argument is also safe: the generator defaults to `${TMPDIR:-/tmp}/nebula-cruise-wav-render`, outside the repository.

## 2. Preferred macOS conversion

The intended system-tool conversion for all six files is:

```bash
for stem in atmosphere drive overdrive; do
  afconvert -f Oggf -d vorb \
    "$WAV_DIR/$stem.wav" "assets/audio/nebula-cruise-$stem.ogg"
  afconvert -f MPG3 -d .mp3 -b 192000 \
    "$WAV_DIR/$stem.wav" "assets/audio/nebula-cruise-$stem.mp3"
done
```

On the macOS installation used for the 2026-08-02 release, both commands failed with `ExtAudioFileSetProperty ('cfmt') failed ('fmt?')`, including for a system AIFF input. If that error occurs, use the pinned temporary FFmpeg fallback below.

## 3. Pinned FFmpeg fallback

Acquire the exact Apple-silicon package into the temporary work directory, verify the recorded npm tarball SHA-1, extract it, and declare its executable path:

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
```

The recorded package contains FFmpeg 4.4. Convert all three stems to OGG Vorbis quality 5 and 192 kbps MP3:

```bash
for stem in atmosphere drive overdrive; do
  "$FFMPEG_BIN" -hide_banner -loglevel error -y \
    -i "$WAV_DIR/$stem.wav" -c:a libvorbis -q:a 5 \
    "assets/audio/nebula-cruise-$stem.ogg"
  "$FFMPEG_BIN" -hide_banner -loglevel error -y \
    -i "$WAV_DIR/$stem.wav" -c:a libmp3lame -b:a 192k \
    "assets/audio/nebula-cruise-$stem.mp3"
done
```

The package, executable, and generated WAVs are temporary tools and intermediates; none belongs in the repository.

## 4. Validate all six outputs

```bash
for file in \
  assets/audio/nebula-cruise-atmosphere.ogg \
  assets/audio/nebula-cruise-drive.ogg \
  assets/audio/nebula-cruise-overdrive.ogg \
  assets/audio/nebula-cruise-atmosphere.mp3 \
  assets/audio/nebula-cruise-drive.mp3 \
  assets/audio/nebula-cruise-overdrive.mp3; do
  afinfo "$file" | awk -v file="$file" \
    '/estimated duration/ { print file "\t" $3 " seconds" }'
done
```

All three files within one format must agree within 1 ms. The 2026-08-02 outputs report 68.571429 seconds for every OGG and 68.597551 seconds for every MP3, where the MP3 duration includes codec delay.

## 5. Safely remove temporary files

Validate that the directory still has the expected `mktemp` prefix before deleting it:

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
