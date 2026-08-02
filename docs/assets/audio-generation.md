# Nebula Cruise audio generation

The committed soundtrack is rendered from `assets/audio/source/nebula-cruise-score.json` by `tools/generate-music.js`. The fixed seed produces three stereo 16-bit PCM WAVs at 44.1 kHz with exactly 3,024,000 frames each. With no output argument, WAVs go to the operating system temporary directory, not the repository.

```bash
node tools/generate-music.js
```

To choose an explicit temporary directory:

```bash
node tools/generate-music.js assets/audio/source/nebula-cruise-score.json /tmp/nebula-cruise-wav
```

The preferred macOS conversions are:

```bash
afconvert -f Oggf -d vorb atmosphere.wav assets/audio/nebula-cruise-atmosphere.ogg
afconvert -f MPG3 -d .mp3 -b 192000 atmosphere.wav assets/audio/nebula-cruise-atmosphere.mp3
```

Repeat for `drive.wav` and `overdrive.wav`. On the macOS installation used for the 2026-08-02 release, both commands failed with `ExtAudioFileSetProperty ('cfmt') failed ('fmt?')`, including for a system AIFF input. The compatible fallback was the temporary, uncommitted `@ffmpeg-installer/darwin-arm64@4.1.5` package (FFmpeg 4.4):

```bash
ffmpeg -hide_banner -loglevel error -y -i atmosphere.wav -c:a libvorbis -q:a 5 assets/audio/nebula-cruise-atmosphere.ogg
ffmpeg -hide_banner -loglevel error -y -i atmosphere.wav -c:a libmp3lame -b:a 192k assets/audio/nebula-cruise-atmosphere.mp3
```

No FFmpeg package or binary belongs in the repository. Validate all six outputs with `afinfo`; within each format the three reported durations must agree within 1 ms. Delete or trash the temporary WAV directory after validation.
