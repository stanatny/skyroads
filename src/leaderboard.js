'use strict';

(function attachLeaderboard(root) {
  const DEFAULT_NAMES = Object.freeze(['Nova','Orion','Vega','Luna','Atlas','Echo','Comet','Cosmo','Lyra','Zenith']);
  const STORAGE_KEYS = Object.freeze({
    active: 'skyroads_leaderboard_v1',
    backup: 'skyroads_leaderboard_v1_backup',
    legacy: 'skyroads_best',
  });
  const MAX_ENTRIES = 15;
  const MAX_NAME_CHARACTERS = 16;
  const MAX_ID_CHARACTERS = 128;
  const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

  function isFiniteNonnegative(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function calculateScore({ distanceMeters, enemyKills, enemyKillBonus = 20 } = {}) {
    if (!isFiniteNonnegative(distanceMeters)
      || !isFiniteNonnegative(enemyKills)
      || !isFiniteNonnegative(enemyKillBonus)) return 0;
    return Math.floor(distanceMeters) + Math.floor(enemyKills) * enemyKillBonus;
  }

  // Unicode 16.0 union of Grapheme_Extend, Spacing_Mark, Emoji_Modifier, and
  // Variation_Selector, encoded as base-36 inclusive ranges. Keeping this
  // generated table local makes the fallback deterministic and lets classic
  // WebViews work without parsing Unicode-property regular expressions.
  function decodeRanges(encodedData) {
    return encodedData.split(',').map((encodedRange) => {
      const parts = encodedRange.split('-');
      const start = parseInt(parts[0], 36);
      return [start, parts.length === 1 ? start : parseInt(parts[1], 36)];
    });
  }

  const UNICODE_16_EXTENDER_DATA = 'lc-of,w3-w9,13l-14t,14v,14x-14y,150-151,153,174-17e,18r-19b,19s,1cm-1cs,1cv-1d0,1d3-1d4,1d6-1d9,1e9,1f4-1fu,1ie-1io,1kb-1kj,1kt,1li-1ll,1ln-1lv,1lx-1lz,1m1-1m5,1nd-1nf,1p3-1pb,1qi-1r5,1r7-1s3,1tm-1to,1tq-1u7,1u9-1uf,1uq-1ur,1vl-1vn,1x8,1xa-1xg,1xj-1xk,1xn-1xp,1xz,1ya-1yb,1z2,1z5-1z7,20s,20u-20y,213-214,217-219,21d,228-229,22d,22p-22r,24c,24e-24l,24n-24p,24r-24t,25e-25f,262-267,269-26b,27w,27y-284,287-288,28b-28d,28l-28n,28y-28z,29u,2bi-2bm,2bq-2bs,2bu-2bx,2c7,2dc-2dg,2f0,2f2-2f8,2fa-2fc,2fe-2fh,2fp-2fq,2g2-2g3,2gx-2gz,2ik,2im-2is,2iu-2iw,2iy-2j1,2j9-2ja,2jm-2jn,2k3,2kg-2kj,2m3-2m4,2m6-2mc,2me-2mg,2mi-2ml,2mv,2n6-2n7,2o1-2o3,2q2,2q7-2qc,2qe,2qg-2qn,2r6-2r7,2sx,2t0-2t6,2tj-2tq,2wh,2wk-2ws,2x4-2xa,2zc-2zd,305,307,309,30e-30f,31t-32c,32e-32f,32l-32v,32x-33w,346,36z-37i,386-389,38e-38g,38i-38k,38n-38t,38x-390,39e-39p,39r,3a2-3a5,3tp-3tr,4k2-4k5,4ky-4l0,4lu-4lv,4mq-4mr,4ok-4pf,4pp,4qz-4r1,4r3,4ud-4ue,4vd,4yo-4yz,4z4-4zf,55j-55n,579-57i,57k-58c,58f,59s-5am,5c0-5c4,5dg-5dw,5ez-5f7,5fk-5fm,5gh-5gt,5ie-5ir,5k4-5kn,5ow-5oy,5p0-5pk,5pp,5pw,5pz-5q1,5vk-5xb,6bw,6hc-6i8,8vj-8vl,8zj,928-933,9ii-9in,9ll-9lm,wvj-wvm,wvo-wvx,wwu-wwv,wz4-wz5,x6q,x6u,x6z,x7n-x7r,x7w,xa8-xa9,xbo-xc5,xcw-xdd,xdr,xeu-xf1,xfr-xg3,xhc-xhf,xir-xj4,xk5,xm1-xme,xmr,xn0-xn1,xob-xod,xps,xpu-xpw,xpz-xq0,xq6-xq7,xq9,xrf-xrj,xrp-xrq,xyb-xyi,xyk-xyl,1dlq,1e68-1e6n,1e74-1e7j,1ehq-1ehr,1eyl,1f4w,1f92-1f96,1gjl-1gjn,1gjp-1gjq,1gjw-1gjz,1gl4-1gl6,1glb,1gpx-1gpy,1h5w-1h5z,1h7t-1h7x,1hgr-1hgs,1hj0-1hj3,1hl2-1hlc,1hmq-1hmt,1hq8-1hqa,1hrs-1hs6,1htc,1htf-1htg,1htr-1htu,1hv4-1hve,1hvm,1hxc-1hxe,1hyf-1hys,1hz9-1hza,1i0j,1i0w-1i0y,1i2b-1i2o,1i2x-1i30,1i32-1i33,1i5o-1i5z,1i66,1i69,1ian-1iay,1ibk-1ibn,1id7-1id8,1ida-1idg,1idj-1idk,1idn-1idp,1idz,1iea-1ieb,1iee-1iek,1ieo-1ies,1igo-1igw,1igy,1ih1,1ih3-1ih6,1ih8-1ihc,1ihe,1iht-1ihu,1ik5-1ikm,1ila,1ink-1io3,1iun-1iut,1iuw-1iv4,1ivw-1ivx,1iy8-1iyo,1j1n-1j1z,1j4t-1j57,1jcc-1jcq,1jjk-1jjp,1jjr-1jjs,1jjv-1jjy,1jk0,1jk2-1jk3,1jo1-1jo7,1joa-1jog,1jok,1jpd-1jpm,1jqr-1jqx,1jqz-1jr2,1jrb,1jrl-1jrv,1jt6-1jtl,1k4v-1k52,1k54-1k5b,1k7m-1k87,1k89-1k8m,1kc1-1kc6,1kca,1kcc-1kcd,1kcf-1kcl,1kcn,1kei-1kem,1keo-1kep,1ker-1kev,1koj-1kom,1kow-1kox,1koz,1kqc-1kqi,1kqm-1kqq,1kre,1ow0,1ow7-1owl,1xr2-1xrj,1zow-1zp0,1zqo-1zqu,20jz,20k1-20lj,20lr-20lu,20o4,20og-20oh,2ftp-2ftq,2jgg-2jhp,2jhs-2jie,2jxh-2jxl,2jxp-2jxu,2jy3-2jya,2jyd-2jyj,2jze-2jzh,2k3m-2k3o,2lmo-2lo6,2lob-2lpo,2lpx,2lqc,2lqz-2lr3,2lr5-2lrj,2mtc-2mti,2mtk-2mu0,2mu3-2mu9,2mub-2muc,2mue-2mui,2mxb,2n1s-2n1y,2nce,2ne4-2ne7,2nsc-2nsf,2nzi-2nzj,2ok0-2ok6,2on8-2one,2qrf-2qrj,jnz4-jo1r,jo5c-jobz';
  const UNICODE_16_EXTENDER_RANGES = decodeRanges(UNICODE_16_EXTENDER_DATA);

  function isStructuralExtender(character) {
    const codePoint = character.codePointAt(0);
    let low = 0;
    let high = UNICODE_16_EXTENDER_RANGES.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const range = UNICODE_16_EXTENDER_RANGES[middle];
      if (codePoint < range[0]) high = middle - 1;
      else if (codePoint > range[1]) low = middle + 1;
      else return true;
    }
    return false;
  }

  function isRegionalIndicator(character) {
    const codePoint = character.codePointAt(0);
    return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
  }

  function inCodePointRanges(character, ranges) {
    const codePoint = character.codePointAt(0);
    for (const range of ranges) {
      if (codePoint >= range[0] && codePoint <= range[1]) return true;
    }
    return false;
  }

  // Grapheme_Cluster_Break=Prepend, Unicode 16.0.
  const PREPEND_RANGES = Object.freeze([
    [0x0600, 0x0605], [0x06dd, 0x06dd], [0x070f, 0x070f], [0x0890, 0x0891],
    [0x08e2, 0x08e2], [0x0d4e, 0x0d4e], [0x110bd, 0x110bd], [0x110cd, 0x110cd],
    [0x111c2, 0x111c3], [0x113d1, 0x113d1], [0x1193f, 0x1193f], [0x11941, 0x11941],
    [0x11a3a, 0x11a3a], [0x11a84, 0x11a89], [0x11d46, 0x11d46], [0x11f02, 0x11f02],
  ]);

  // Indic_Conjunct_Break=Consonant/Linker/Extend, Unicode 16.0. InCB Extend
  // deliberately has its own table: Grapheme_Cluster_Break=SpacingMark is a
  // structural extender for GB9a, but must not be scanned through by GB9c.
  const INDIC_CONSONANT_RANGES = Object.freeze([
    [0x0915, 0x0939], [0x0958, 0x095f], [0x0978, 0x097f],
    [0x0995, 0x09a8], [0x09aa, 0x09b0], [0x09b2, 0x09b2], [0x09b6, 0x09b9],
    [0x09dc, 0x09dd], [0x09df, 0x09df], [0x09f0, 0x09f1],
    [0x0a95, 0x0aa8], [0x0aaa, 0x0ab0], [0x0ab2, 0x0ab3], [0x0ab5, 0x0ab9], [0x0af9, 0x0af9],
    [0x0b15, 0x0b28], [0x0b2a, 0x0b30], [0x0b32, 0x0b33], [0x0b35, 0x0b39],
    [0x0b5c, 0x0b5d], [0x0b5f, 0x0b5f], [0x0b71, 0x0b71],
    [0x0c15, 0x0c28], [0x0c2a, 0x0c39], [0x0c58, 0x0c5a], [0x0d15, 0x0d3a],
  ]);
  const INDIC_LINKER_RANGES = Object.freeze([
    [0x094d, 0x094d], [0x09cd, 0x09cd], [0x0acd, 0x0acd],
    [0x0b4d, 0x0b4d], [0x0c4d, 0x0c4d], [0x0d4d, 0x0d4d],
  ]);
  const UNICODE_16_INCB_EXTEND_DATA = 'lc-of,w3-w7,w8-w9,13l-14t,14v,14x-14y,150-151,153,174-17e,18r-19b,19s,1cm-1cs,1cv-1d0,1d3-1d4,1d6-1d9,1e9,1f4-1fu,1ie-1io,1kb-1kj,1kt,1li-1ll,1ln-1lv,1lx-1lz,1m1-1m5,1nd-1nf,1p3-1pb,1qi-1r5,1r7-1s2,1tm,1to,1tt-1u0,1u9-1uf,1uq-1ur,1vl,1x8,1xa,1xd-1xg,1xz,1ya-1yb,1z2,1z5-1z6,20s,20x-20y,213-214,217-219,21d,228-229,22d,22p-22q,24c,24h-24l,24n-24o,25e-25f,262-267,269,27w,27y,27z,281-284,28l-28m,28n,28y-28z,29u,2bi,2bk,2bx,2c7,2dc,2dg,2f0,2f2-2f4,2fa-2fc,2fe-2fg,2fp-2fq,2g2-2g3,2gx,2ik,2in,2io,2iq,2iu,2iv-2iw,2iy-2iz,2j0-2j1,2j9-2ja,2jm-2jn,2kg-2kh,2m3-2m4,2m6,2m9-2mc,2mv,2n6-2n7,2o1,2q2,2q7,2qa-2qc,2qe,2qn,2sx,2t0-2t6,2tj-2tq,2wh,2wk-2ws,2x4-2xa,2zc-2zd,305,307,309,31t-326,328-32c,32e-32f,32l-32v,32x-33w,346,371-374,376-37b,37d-37e,37h-37i,388-389,38e-38g,38x-390,39e,39h-39i,39p,3a5,3tp-3tr,4k2-4k4,4k5,4ky-4kz,4l0,4lu-4lv,4mq-4mr,4ok-4ol,4on-4ot,4p2,4p5-4pf,4pp,4qz-4r1,4r3,4ud-4ue,4vd,4yo-4yq,4yv-4yw,4z6,4zd-4zf,55j-55k,55n,57a,57c-57i,57k,57m,57p-57w,583-58c,58f,59s-5a5,5a6,5a7-5am,5c0-5c3,5dg,5dh,5di-5dm,5dn,5do,5dp,5du,5dv-5dw,5ez-5f7,5fk-5fl,5gi-5gl,5go-5gp,5gq,5gr-5gt,5ie,5ig-5ih,5il,5in-5ip,5iq-5ir,5kc-5kj,5km-5kn,5ow-5oy,5p0-5pc,5pe-5pk,5pp,5pw,5q0-5q1,5vk-5xb,6bx,6hc-6ho,6hp-6hs,6ht,6hu-6hw,6hx-6i8,8vj-8vl,8zj,928-933,9ii-9il,9im-9in,9ll-9lm,wvj,wvk-wvm,wvo-wvx,wwu-wwv,wz4-wz5,x6q,x6u,x6z,x7p-x7q,x7w,xc4-xc5,xcw-xdd,xdr,xeu-xf1,xfr-xg1,xg3,xhc-xhe,xir,xiu-xix,xj0-xj1,xj4,xk5,xm1-xm6,xm9-xma,xmd-xme,xmr,xn0,xoc,xps,xpu-xpw,xpz-xq0,xq6-xq7,xq9,xrg-xrh,xrq,xyd,xyg,xyl,1dlq,1e68-1e6n,1e74-1e7j,1ehq-1ehr,1eyl,1f4w,1f92-1f96,1gjl-1gjn,1gjp-1gjq,1gjw-1gjz,1gl4-1gl6,1glb,1gpx-1gpy,1h5w-1h5z,1h7t-1h7x,1hgr-1hgs,1hj0-1hj3,1hl2-1hlc,1hmq-1hmt,1hq9,1hrs-1hs6,1htc,1htf-1htg,1htr-1htt,1hv7-1hva,1hvd-1hve,1hvm,1hxc-1hxe,1hyf-1hyj,1hyl-1hys,1i0j,1i0w-1i0x,1i2e-1i2m,1i2o,1i2x-1i30,1i33,1i5r-1i5t,1i5w,1i5x,1i5y-1i5z,1i66,1i69,1ian,1iar-1iay,1ibk-1ibl,1id7-1id8,1ida,1idc,1idp,1idz,1iee-1iek,1ieo-1ies,1igo,1igr-1igw,1igy,1ih1,1ih3-1ih5,1iha,1ihb,1ihc,1ihe,1iht-1ihu,1ik8-1ikf,1iki-1ikk,1ikm,1ila,1ink,1inn-1ins,1inu,1inx,1inz-1io0,1io2-1io3,1iun,1iuq-1iut,1iv0-1iv1,1iv3-1iv4,1ivw-1ivx,1iyb-1iyi,1iyl,1iyn-1iyo,1j1n,1j1p,1j1s-1j1x,1j1y,1j1z,1j4t,1j4v,1j4y-1j51,1j53-1j57,1jcf-1jcn,1jcp-1jcq,1jjk,1jjv-1jjw,1jjx,1jjy,1jk3,1jo4-1jo7,1joa-1job,1jog,1jpd-1jpm,1jqr-1jqw,1jqz-1jr2,1jrb,1jrl-1jrq,1jrt-1jrv,1jt6-1jti,1jtk-1jtl,1k4w-1k52,1k54-1k59,1k5b,1k7m-1k87,1k8a-1k8g,1k8i-1k8j,1k8l-1k8m,1kc1-1kc6,1kca,1kcc-1kcd,1kcf-1kcl,1kcn,1keo-1kep,1ket,1kev,1koj-1kok,1kow-1kox,1kqe-1kqi,1kqo,1kqp,1kqq,1kre,1ow0,1ow7-1owl,1xr2-1xrd,1xrh-1xrj,1zow-1zp0,1zqo-1zqu,20jz,20lr-20lu,20o4,20og-20oh,2ftp-2ftq,2jgg-2jhp,2jhs-2jie,2jxh-2jxi,2jxj-2jxl,2jxp-2jxu,2jy3-2jya,2jyd-2jyj,2jze-2jzh,2k3m-2k3o,2lmo-2lo6,2lob-2lpo,2lpx,2lqc,2lqz-2lr3,2lr5-2lrj,2mtc-2mti,2mtk-2mu0,2mu3-2mu9,2mub-2muc,2mue-2mui,2mxb,2n1s-2n1y,2nce,2ne4-2ne7,2nsc-2nsf,2nzi-2nzj,2ok0-2ok6,2on8-2one,2qrf-2qrj,jnz4-jo1r,jo5c-jobz';
  const UNICODE_16_INCB_EXTEND_RANGES = decodeRanges(UNICODE_16_INCB_EXTEND_DATA);

  function isPrepend(character) {
    return Boolean(character) && inCodePointRanges(character, PREPEND_RANGES);
  }

  function isIndicConsonant(character) {
    return Boolean(character) && inCodePointRanges(character, INDIC_CONSONANT_RANGES);
  }

  function isIndicLinker(character) {
    return Boolean(character) && inCodePointRanges(character, INDIC_LINKER_RANGES);
  }

  function isIndicExtend(character) {
    return Boolean(character) && inCodePointRanges(character, UNICODE_16_INCB_EXTEND_RANGES);
  }

  function hangulSyllableType(character) {
    if (!character) return null;
    const codePoint = character.codePointAt(0);
    if ((codePoint >= 0x1100 && codePoint <= 0x115f)
      || (codePoint >= 0xa960 && codePoint <= 0xa97c)) return 'L';
    if ((codePoint >= 0x1160 && codePoint <= 0x11a7)
      || (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)
      || codePoint === 0x16d63
      || (codePoint >= 0x16d67 && codePoint <= 0x16d6a)) return 'V';
    if ((codePoint >= 0x11a8 && codePoint <= 0x11ff)
      || (codePoint >= 0xd7cb && codePoint <= 0xd7fb)) return 'T';
    if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
      return (codePoint - 0xac00) % 28 === 0 ? 'LV' : 'LVT';
    }
    return null;
  }

  function joinsHangul(previousType, nextType) {
    return (previousType === 'L' && ['L', 'V', 'LV', 'LVT'].includes(nextType))
      || (['LV', 'V'].includes(previousType) && ['V', 'T'].includes(nextType))
      || (['LVT', 'T'].includes(previousType) && nextType === 'T');
  }

  function isGraphemeBase(character) {
    return Boolean(character) && character !== '\u200d' && !isStructuralExtender(character);
  }

  // Compact UAX #29-style fallback for macOS WebViews predating Intl.Segmenter.
  // The pinned Unicode 16 table above supplies deterministic mark/modifier ranges.
  // Malformed standalone extenders and invalid ZWJ runs are discarded rather than emitted dangling.
  function fallbackSegmentGraphemes(value) {
    const codePoints = Array.from(value);
    const clusters = [];
    for (let index = 0; index < codePoints.length;) {
      let cluster = '';
      while (index < codePoints.length && isPrepend(codePoints[index])) {
        cluster += codePoints[index];
        index += 1;
      }
      if (index >= codePoints.length) {
        if (cluster) clusters.push(cluster);
        break;
      }
      if (!isGraphemeBase(codePoints[index])) {
        index += 1;
        continue;
      }

      const firstBase = codePoints[index];
      cluster += firstBase;
      index += 1;

      if (cluster === '\r' && codePoints[index] === '\n') {
        cluster += codePoints[index];
        index += 1;
      } else if (isRegionalIndicator(firstBase)
        && index < codePoints.length
        && isRegionalIndicator(codePoints[index])) {
        cluster += codePoints[index];
        index += 1;
      } else {
        let previousHangulType = hangulSyllableType(firstBase);
        let nextHangulType = hangulSyllableType(codePoints[index]);
        while (joinsHangul(previousHangulType, nextHangulType)) {
          cluster += codePoints[index];
          index += 1;
          previousHangulType = nextHangulType;
          nextHangulType = hangulSyllableType(codePoints[index]);
        }
      }

      // GB9c: Consonant (Extend|Linker)* Linker (Extend|Linker)* × Consonant.
      if (isIndicConsonant(firstBase)) {
        let keepJoining = true;
        while (keepJoining) {
          let cursor = index;
          let linkerSeen = false;
          while (cursor < codePoints.length
            && (isIndicExtend(codePoints[cursor]) || isIndicLinker(codePoints[cursor]))) {
            if (isIndicLinker(codePoints[cursor])) linkerSeen = true;
            cursor += 1;
          }
          if (!linkerSeen || !isIndicConsonant(codePoints[cursor])) {
            keepJoining = false;
            break;
          }
          while (index <= cursor) {
            cluster += codePoints[index];
            index += 1;
          }
        }
      }

      while (index < codePoints.length && isStructuralExtender(codePoints[index])) {
        cluster += codePoints[index];
        index += 1;
      }

      // A ZWJ without the GB9c linker chain still extends an Indic cluster,
      // but it must not incorrectly pull the following consonant into it.
      if (isIndicConsonant(firstBase)) {
        while (codePoints[index] === '\u200d') {
          cluster += codePoints[index];
          index += 1;
        }
      }

      while (codePoints[index] === '\u200d') {
        let joinerEnd = index;
        while (codePoints[joinerEnd] === '\u200d') joinerEnd += 1;
        if (joinerEnd !== index + 1 || !isGraphemeBase(codePoints[joinerEnd])) {
          index = joinerEnd;
          while (index < codePoints.length && isStructuralExtender(codePoints[index])) index += 1;
          break;
        }
        if (joinerEnd >= codePoints.length) {
          index += 1;
          break;
        }
        cluster += codePoints[index] + codePoints[joinerEnd];
        index = joinerEnd + 1;
        while (index < codePoints.length && isStructuralExtender(codePoints[index])) {
          cluster += codePoints[index];
          index += 1;
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  function segmentGraphemes(value) {
    try {
      if (root.Intl && typeof root.Intl.Segmenter === 'function') {
        const segmenter = new root.Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(segmenter.segment(value), (part) => part.segment);
      }
    } catch (_) {
      // Older WebViews and partial Intl implementations use the safe fallback.
    }
    return fallbackSegmentGraphemes(value);
  }

  function sanitizeCharacters(value, limit, { trim = true } = {}) {
    const cleaned = String(value == null ? '' : value).replace(CONTROL_CHARACTERS, '');
    return segmentGraphemes(trim ? cleaned.trim() : cleaned)
      .slice(0, limit)
      .join('');
  }

  function sanitizeNameInput(value, { trim = true } = {}) {
    return sanitizeCharacters(value, MAX_NAME_CHARACTERS, { trim });
  }

  function normalizeName(value, fallbackName = DEFAULT_NAMES[0]) {
    const normalized = sanitizeCharacters(value, MAX_NAME_CHARACTERS);
    if (normalized) return normalized;
    return sanitizeCharacters(fallbackName, MAX_NAME_CHARACTERS) || DEFAULT_NAMES[0];
  }

  function generateDefaultName({ random = Math.random } = {}) {
    let sample;
    try {
      sample = Number(random());
    } catch (_) {
      sample = 0;
    }
    if (!Number.isFinite(sample)) sample = 0;
    const bounded = Math.max(0, Math.min(0.9999999999999999, sample));
    return DEFAULT_NAMES[Math.floor(bounded * DEFAULT_NAMES.length)];
  }

  function compareCodeUnits(a, b) {
    const left = String(a);
    const right = String(b);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function compareEntries(a, b) {
    return (b.score - a.score)
      || (b.distanceMeters - a.distanceMeters)
      || (a.elapsedMs - b.elapsedMs)
      || compareCodeUnits(a.createdAt, b.createdAt)
      || compareCodeUnits(a.id, b.id);
  }

  function sortEntries(entries) {
    return Array.isArray(entries) ? entries.slice().sort(compareEntries) : [];
  }

  function sanitizeId(value) {
    if (typeof value !== 'string') return null;
    const id = sanitizeCharacters(value, MAX_ID_CHARACTERS);
    return id || null;
  }

  function sanitizeIsoDate(value) {
    if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : value;
  }

  function validateEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = sanitizeId(value.id);
    const playerId = sanitizeId(value.playerId);
    const rawName = typeof value.name === 'string' ? value.name : '';
    const name = normalizeName(rawName, '');
    const createdAt = sanitizeIsoDate(value.createdAt);
    if (!id || !playerId || !sanitizeCharacters(rawName, MAX_NAME_CHARACTERS) || !createdAt) return null;
    if (!Number.isInteger(value.score) || !isFiniteNonnegative(value.score)
      || !isFiniteNonnegative(value.distanceMeters)
      || !isFiniteNonnegative(value.elapsedMs)) return null;
    return {
      id,
      playerId,
      name,
      score: value.score,
      distanceMeters: value.distanceMeters,
      elapsedMs: value.elapsedMs,
      createdAt,
    };
  }

  function validateDocument(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return null;
    if (!value.profile || typeof value.profile !== 'object' || Array.isArray(value.profile)) return null;
    const playerId = sanitizeId(value.profile.playerId);
    const rawName = typeof value.profile.name === 'string' ? value.profile.name : '';
    const name = normalizeName(rawName, '');
    if (!playerId || !sanitizeCharacters(rawName, MAX_NAME_CHARACTERS) || !Array.isArray(value.entries)) return null;

    const seenIds = new Set();
    const entries = [];
    for (const candidate of value.entries) {
      const entry = validateEntry(candidate);
      if (!entry || seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      entries.push(entry);
    }

    const document = {
      version: 1,
      profile: { playerId, name },
      entries: sortEntries(entries).slice(0, MAX_ENTRIES),
    };
    if (isFiniteNonnegative(value.legacyBest)) document.legacyBest = value.legacyBest;
    return document;
  }

  function documentsEqual(left, right) {
    const validLeft = validateDocument(left);
    const validRight = validateDocument(right);
    return Boolean(validLeft && validRight && JSON.stringify(validLeft) === JSON.stringify(validRight));
  }

  function reconcileDocuments(memoryDocument, backupDocument, activeDocument) {
    const memory = validateDocument(memoryDocument);
    const backup = validateDocument(backupDocument);
    const active = validateDocument(activeDocument);
    const authority = active || backup || memory;
    if (!authority) return null;

    const entriesById = new Map();
    for (const document of [memory, backup, active]) {
      if (!document) continue;
      for (const entry of document.entries) entriesById.set(entry.id, entry);
    }
    const profile = { ...authority.profile };
    const entries = sortEntries([...entriesById.values()])
      .slice(0, MAX_ENTRIES)
      .map((entry) => entry.playerId === profile.playerId ? { ...entry, name: profile.name } : { ...entry });
    const reconciled = { version: 1, profile, entries };
    // Absence is a tombstone: only the latest authoritative document may retain legacyBest.
    if (Object.prototype.hasOwnProperty.call(authority, 'legacyBest')) {
      reconciled.legacyBest = authority.legacyBest;
    }
    return validateDocument(reconciled);
  }

  function renameProfile(document, rawName) {
    const valid = validateDocument(document);
    if (!valid) return null;
    const name = normalizeName(rawName, valid.profile.name);
    const playerId = valid.profile.playerId;
    return {
      ...valid,
      profile: { playerId, name },
      entries: valid.entries.map((entry) => entry.playerId === playerId ? { ...entry, name } : entry),
    };
  }

  function createLeaderboard({
    storage,
    cryptoObject = root.crypto,
    now = () => new Date(),
    random = Math.random,
    keys = STORAGE_KEYS,
  } = {}) {
    let currentDocument = null;
    let initialized = false;
    let persistenceAvailable = Boolean(storage);
    let fallbackIdCounter = 0;
    let handlingStorageEvent = false;
    const finalizedRuns = new Map();

    function snapshot() {
      const valid = validateDocument(currentDocument);
      if (!valid) return null;
      return {
        version: valid.version,
        profile: { ...valid.profile },
        entries: valid.entries.map((entry) => ({ ...entry })),
        legacyBest: Object.prototype.hasOwnProperty.call(valid, 'legacyBest') ? valid.legacyBest : null,
        persistenceAvailable,
        persistenceWarning: !persistenceAvailable,
      };
    }

    function getNow() {
      let value;
      try {
        value = now();
      } catch (_) {
        value = new Date();
      }
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    function createId() {
      try {
        if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
          const generated = sanitizeId(cryptoObject.randomUUID());
          if (generated) return generated;
        }
      } catch (_) {
        // Fall through to a local identifier. IDs are not security credentials.
      }
      let sample;
      try {
        sample = Number(random());
      } catch (_) {
        sample = 0;
      }
      if (!Number.isFinite(sample)) sample = 0;
      fallbackIdCounter += 1;
      return `local-${getNow().getTime().toString(36)}-${Math.abs(sample).toString(36).slice(2, 12)}-${fallbackIdCounter.toString(36)}`;
    }

    function readDocument(key) {
      if (!persistenceAvailable) return null;
      try {
        const raw = storage.getItem(key);
        if (raw == null) return null;
        return validateDocument(JSON.parse(raw));
      } catch (error) {
        if (error instanceof SyntaxError) return null;
        persistenceAvailable = false;
        return null;
      }
    }

    function restoreActive(backupDocument) {
      if (!storage || !backupDocument) return;
      try {
        storage.setItem(keys.active, JSON.stringify(backupDocument));
      } catch (_) {
        // The validated next document remains available in memory.
      }
    }

    function reconcileLatest() {
      const memory = validateDocument(currentDocument);
      if (!persistenceAvailable) return { active: null, backup: null, base: memory };
      const active = readDocument(keys.active);
      const backup = persistenceAvailable ? readDocument(keys.backup) : null;
      const base = active
        ? reconcileDocuments(memory, backup, active)
        : (memory ? reconcileDocuments(backup, null, memory) : backup);
      if (base) currentDocument = base;
      return { active, backup, base };
    }

    function commitMutation(applyMutation, { initial = false, forceWrite = false, maxAttempts = 3 } = {}) {
      if (typeof applyMutation !== 'function') return { persisted: false, previous: currentDocument };
      if (!persistenceAvailable) {
        const previous = validateDocument(currentDocument);
        const next = validateDocument(applyMutation(previous));
        if (next) currentDocument = next;
        return { persisted: false, previous };
      }

      let lastValidReadback = null;
      let lastBackup = null;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const latest = reconcileLatest();
        const previous = validateDocument(latest.base || currentDocument);
        if (!previous || !persistenceAvailable) {
          const nextInMemory = previous && validateDocument(applyMutation(previous));
          if (nextInMemory) currentDocument = nextInMemory;
          return { persisted: false, previous };
        }
        const next = validateDocument(applyMutation(previous));
        if (!next) return { persisted: false, previous };
        currentDocument = next;
        if (!forceWrite
          && documentsEqual(next, previous)
          && latest.active
          && documentsEqual(next, latest.active)) {
          return { persisted: true, previous };
        }

        const preimage = validateDocument(latest.active || latest.backup || previous);
        const serializedNext = JSON.stringify(next);
        try {
          if (!initial && preimage) storage.setItem(keys.backup, JSON.stringify(preimage));
          storage.setItem(keys.active, serializedNext);
          const rawReadback = storage.getItem(keys.active);
          let verified = null;
          try { verified = rawReadback == null ? null : validateDocument(JSON.parse(rawReadback)); } catch (_) {}
          if (!verified) {
            restoreActive(preimage);
            currentDocument = next;
            persistenceAvailable = false;
            return { persisted: false, previous };
          }
          if (documentsEqual(verified, next)) {
            currentDocument = verified;
            return { persisted: true, previous };
          }

          // A different valid document is contention, not corruption. Merge it and retry.
          lastValidReadback = verified;
          lastBackup = latest.backup;
          currentDocument = reconcileDocuments(next, latest.backup, verified) || next;
        } catch (_) {
          restoreActive(preimage);
          currentDocument = next;
          persistenceAvailable = false;
          return { persisted: false, previous };
        }
      }

      // Bounded contention exhaustion keeps the complete session view without restoring stale state.
      const exhaustedBase = reconcileDocuments(currentDocument, lastBackup, lastValidReadback) || currentDocument;
      currentDocument = validateDocument(applyMutation(exhaustedBase)) || exhaustedBase;
      persistenceAvailable = false;
      return { persisted: false, previous: currentDocument };
    }

    function promoteBackup(backupDocument) {
      if (!persistenceAvailable) return false;
      const latestActive = readDocument(keys.active);
      if (latestActive) {
        currentDocument = reconcileDocuments(backupDocument, null, latestActive);
        return true;
      }
      if (!persistenceAvailable) {
        currentDocument = backupDocument;
        return false;
      }
      const serialized = JSON.stringify(backupDocument);
      try {
        storage.setItem(keys.active, serialized);
        const promoted = validateDocument(JSON.parse(storage.getItem(keys.active)));
        if (!promoted || JSON.stringify(promoted) !== serialized) throw new Error('Backup promotion verification failed');
        currentDocument = promoted;
        return true;
      } catch (_) {
        currentDocument = backupDocument;
        persistenceAvailable = false;
        return false;
      }
    }

    function readLegacyBest() {
      if (!persistenceAvailable) return null;
      try {
        const raw = storage.getItem(keys.legacy);
        if (raw == null || String(raw).trim() === '') return null;
        const value = Number(raw);
        return isFiniteNonnegative(value) ? value : null;
      } catch (_) {
        persistenceAvailable = false;
        return null;
      }
    }

    function removeLegacyBest() {
      if (!persistenceAvailable) return false;
      try {
        storage.removeItem(keys.legacy);
        return true;
      } catch (_) {
        persistenceAvailable = false;
        return false;
      }
    }

    function ensureInitialized() {
      if (!initialized) initialize();
    }

    function initialize() {
      if (initialized) return snapshot();
      initialized = true;

      const active = readDocument(keys.active);
      const backup = persistenceAvailable ? readDocument(keys.backup) : null;
      if (active) {
        currentDocument = reconcileDocuments(null, backup, active);
      } else if (backup) {
        currentDocument = backup;
        promoteBackup(backup);
      }

      const legacyBest = readLegacyBest();
      if (!currentDocument) {
        currentDocument = {
          version: 1,
          profile: { playerId: createId(), name: generateDefaultName({ random }) },
          entries: [],
        };
        if (legacyBest != null) currentDocument.legacyBest = legacyBest;
        const persisted = commitMutation(() => currentDocument, { initial: true, forceWrite: true }).persisted;
        if (legacyBest != null && persisted) removeLegacyBest();
        return snapshot();
      }

      if (legacyBest != null && !Object.prototype.hasOwnProperty.call(currentDocument, 'legacyBest')) {
        const result = commitMutation((previous) => ({ ...previous, legacyBest }));
        if (result.persisted) removeLegacyBest();
      } else if (legacyBest != null && Object.prototype.hasOwnProperty.call(currentDocument, 'legacyBest')) {
        removeLegacyBest();
      }
      return snapshot();
    }

    function getSnapshot() {
      ensureInitialized();
      reconcileLatest();
      return snapshot();
    }

    function createRunId() {
      return createId();
    }

    function finalizeRun({ id, distanceMeters, enemyKills, elapsedMs } = {}) {
      ensureInitialized();
      const runId = sanitizeId(id);
      if (!runId) throw new TypeError('A valid run ID is required');
      if (finalizedRuns.has(runId)) return finalizedRuns.get(runId);
      if (!isFiniteNonnegative(distanceMeters)
        || !isFiniteNonnegative(enemyKills)
        || !isFiniteNonnegative(elapsedMs)) throw new TypeError('Run counters must be finite and nonnegative');

      reconcileLatest();
      const existing = currentDocument.entries.find((entry) => entry.id === runId);
      if (existing) {
        const rank = currentDocument.entries.findIndex((entry) => entry.id === runId) + 1;
        const result = {
          id: runId,
          score: existing.score,
          distanceMeters: existing.distanceMeters,
          enemyKills,
          elapsedMs: existing.elapsedMs,
          qualified: true,
          rank,
          cutoff: currentDocument.entries.length === MAX_ENTRIES ? currentDocument.entries[MAX_ENTRIES - 1].score : null,
          entry: { ...existing },
          newLocalBest: rank === 1,
          snapshot: snapshot(),
        };
        finalizedRuns.set(runId, result);
        return result;
      }

      const createdAt = getNow().toISOString();
      let candidate = null;
      commitMutation((base) => {
        candidate = validateEntry({
          id: runId,
          playerId: base.profile.playerId,
          name: base.profile.name,
          score: calculateScore({ distanceMeters, enemyKills }),
          distanceMeters,
          elapsedMs,
          createdAt,
        });
        if (!candidate) return base;
        const ranked = sortEntries([...base.entries.filter((entry) => entry.id !== runId), candidate]);
        const rankIndex = ranked.findIndex((entry) => entry.id === runId);
        if (base.entries.length >= MAX_ENTRIES && rankIndex >= MAX_ENTRIES) return base;
        return { ...base, entries: ranked.slice(0, MAX_ENTRIES) };
      });
      if (!candidate) throw new TypeError('Run data could not be validated');

      const currentSnapshot = snapshot();
      const rankIndex = currentSnapshot.entries.findIndex((entry) => entry.id === runId);
      const qualified = rankIndex >= 0;
      const acceptedEntry = qualified ? currentSnapshot.entries[rankIndex] : null;
      const result = {
        id: runId,
        score: candidate.score,
        distanceMeters,
        enemyKills,
        elapsedMs,
        qualified,
        rank: qualified ? rankIndex + 1 : null,
        cutoff: currentSnapshot.entries.length === MAX_ENTRIES ? currentSnapshot.entries[MAX_ENTRIES - 1].score : null,
        entry: acceptedEntry ? { ...acceptedEntry } : null,
        newLocalBest: qualified && rankIndex === 0,
        snapshot: currentSnapshot,
      };
      finalizedRuns.set(runId, result);
      return result;
    }

    function renamePlayer(rawName) {
      ensureInitialized();
      reconcileLatest();
      const previousName = currentDocument.profile.name;
      const result = commitMutation((base) => renameProfile(base, rawName));
      const changed = currentDocument.profile.name !== previousName;
      return { changed, persisted: changed ? result.persisted : persistenceAvailable, snapshot: snapshot() };
    }

    function acknowledgeLegacyBest() {
      ensureInitialized();
      reconcileLatest();
      if (!Object.prototype.hasOwnProperty.call(currentDocument, 'legacyBest')) {
        return { changed: false, persisted: persistenceAvailable, snapshot: snapshot() };
      }
      const result = commitMutation((base) => {
        const next = { ...base };
        delete next.legacyBest;
        return next;
      });
      return { changed: true, persisted: result.persisted, snapshot: snapshot() };
    }

    function handleStorageEvent(event) {
      ensureInitialized();
      if (handlingStorageEvent || !persistenceAvailable || !event || event.key !== keys.active) {
        return { changed: false, repaired: false, snapshot: snapshot() };
      }
      if (event.storageArea != null && event.storageArea !== storage) {
        return { changed: false, repaired: false, snapshot: snapshot() };
      }

      handlingStorageEvent = true;
      try {
        const before = validateDocument(currentDocument);
        const active = readDocument(keys.active);
        const backup = persistenceAvailable ? readDocument(keys.backup) : null;
        const merged = active
          ? reconcileDocuments(before, backup, active)
          : (before ? reconcileDocuments(backup, null, before) : backup);
        if (merged) currentDocument = merged;
        const needsRepair = Boolean(merged && (!active || !documentsEqual(active, merged)));
        let repaired = false;
        if (needsRepair) {
          repaired = commitMutation((base) => base, { forceWrite: true }).persisted;
        }
        return {
          changed: Boolean(before && currentDocument && !documentsEqual(before, currentDocument)),
          repaired,
          snapshot: snapshot(),
        };
      } finally {
        handlingStorageEvent = false;
      }
    }

    return Object.freeze({
      initialize,
      getSnapshot,
      createRunId,
      finalizeRun,
      renamePlayer,
      acknowledgeLegacyBest,
      handleStorageEvent,
    });
  }

  const api = Object.freeze({
    DEFAULT_NAMES,
    STORAGE_KEYS,
    MAX_ENTRIES,
    MAX_NAME_CHARACTERS,
    calculateScore,
    segmentGraphemes,
    sanitizeNameInput,
    normalizeName,
    generateDefaultName,
    compareEntries,
    sortEntries,
    validateEntry,
    validateDocument,
    reconcileDocuments,
    renameProfile,
    createLeaderboard,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.leaderboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
