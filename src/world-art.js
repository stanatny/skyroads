'use strict';

(function attachWorldArt(root) {
  const YAW_DEGREES = Object.freeze([-80, -55, -30, 0, 30, 55, 80]);
  const PITCH_DEGREES = Object.freeze([20, 55, 80]);
  const LEGACY_YAW_DEGREES = Object.freeze([-30, -20, -10, 0, 10, 20, 30]);
  const VIEW_PROFILES = Object.freeze({
    airborne: Object.freeze({ minYaw: -80, maxYaw: 80 }),
    grounded: Object.freeze({ minYaw: -18, maxYaw: 18 }),
  });

  const GENERATED_UPRIGHT_ATLAS_DATA = (() => {
    const deepFreeze = (value) => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
      }
      return value;
    };
    return deepFreeze({
      "drone-scout": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":226.8,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.985992,"y":306.574074},"source":{"sx":83,"sy":216,"sw":153,"sh":91}},{"origin":{"x":479.985992,"y":306.574074},"source":{"sx":403,"sy":216,"sw":154,"sh":91}},{"origin":{"x":799.985992,"y":306.574074},"source":{"sx":728,"sy":216,"sw":143,"sh":91}},{"origin":{"x":1119.985992,"y":306.574074},"source":{"sx":1052,"sy":216,"sw":136,"sh":91}},{"origin":{"x":1439.985992,"y":306.574074},"source":{"sx":1368,"sy":216,"sw":143,"sh":91}},{"origin":{"x":1759.985992,"y":306.574074},"source":{"sx":1683,"sy":216,"sw":154,"sh":91}},{"origin":{"x":2079.985992,"y":306.574074},"source":{"sx":2004,"sy":216,"sw":152,"sh":91}},{"origin":{"x":159.985992,"y":626.574074},"source":{"sx":83,"sy":513,"sw":153,"sh":114}},{"origin":{"x":479.985992,"y":626.574074},"source":{"sx":403,"sy":513,"sw":154,"sh":114}},{"origin":{"x":799.985992,"y":626.574074},"source":{"sx":728,"sy":513,"sw":143,"sh":114}},{"origin":{"x":1119.985992,"y":626.574074},"source":{"sx":1052,"sy":513,"sw":136,"sh":114}},{"origin":{"x":1439.985992,"y":626.574074},"source":{"sx":1368,"sy":513,"sw":143,"sh":114}},{"origin":{"x":1759.985992,"y":626.574074},"source":{"sx":1682,"sy":513,"sw":155,"sh":114}},{"origin":{"x":2079.985992,"y":626.574074},"source":{"sx":2004,"sy":513,"sw":152,"sh":114}},{"origin":{"x":159.985992,"y":946.574074},"source":{"sx":83,"sy":828,"sw":153,"sh":119}},{"origin":{"x":479.985992,"y":946.574074},"source":{"sx":403,"sy":828,"sw":154,"sh":119}},{"origin":{"x":799.985992,"y":946.574074},"source":{"sx":728,"sy":828,"sw":143,"sh":119}},{"origin":{"x":1119.985992,"y":946.574074},"source":{"sx":1052,"sy":828,"sw":136,"sh":119}},{"origin":{"x":1439.985992,"y":946.574074},"source":{"sx":1368,"sy":828,"sw":143,"sh":119}},{"origin":{"x":1759.985992,"y":946.574074},"source":{"sx":1683,"sy":828,"sw":154,"sh":119}},{"origin":{"x":2079.985992,"y":946.574074},"source":{"sx":2004,"sy":828,"sw":152,"sh":119}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.31410675381263614,"worldBounds":{"maxX":216,"maxY":500,"maxZ":25,"minX":-216,"minY":140,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "drone-striker": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":171.694557,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.985992,"y":319.574074},"source":{"sx":100,"sy":228,"sw":119,"sh":91}},{"origin":{"x":479.985992,"y":319.574074},"source":{"sx":418,"sy":228,"sw":123,"sh":91}},{"origin":{"x":799.985992,"y":319.574074},"source":{"sx":738,"sy":228,"sw":124,"sh":91}},{"origin":{"x":1119.985992,"y":319.574074},"source":{"sx":1052,"sy":228,"sw":136,"sh":91}},{"origin":{"x":1439.985992,"y":319.574074},"source":{"sx":1378,"sy":228,"sw":124,"sh":91}},{"origin":{"x":1759.985992,"y":319.574074},"source":{"sx":1698,"sy":228,"sw":123,"sh":91}},{"origin":{"x":2079.985992,"y":319.574074},"source":{"sx":2020,"sy":228,"sw":119,"sh":91}},{"origin":{"x":159.985992,"y":639.574074},"source":{"sx":101,"sy":555,"sw":118,"sh":84}},{"origin":{"x":479.985992,"y":639.574074},"source":{"sx":418,"sy":555,"sw":123,"sh":84}},{"origin":{"x":799.985992,"y":639.574074},"source":{"sx":738,"sy":555,"sw":124,"sh":84}},{"origin":{"x":1119.985992,"y":639.574074},"source":{"sx":1052,"sy":555,"sw":136,"sh":84}},{"origin":{"x":1439.985992,"y":639.574074},"source":{"sx":1378,"sy":555,"sw":124,"sh":84}},{"origin":{"x":1759.985992,"y":639.574074},"source":{"sx":1698,"sy":555,"sw":123,"sh":84}},{"origin":{"x":2079.985992,"y":639.574074},"source":{"sx":2021,"sy":555,"sw":118,"sh":84}},{"origin":{"x":159.985992,"y":959.574074},"source":{"sx":101,"sy":873,"sw":118,"sh":86}},{"origin":{"x":479.985992,"y":959.574074},"source":{"sx":418,"sy":873,"sw":123,"sh":86}},{"origin":{"x":799.985992,"y":959.574074},"source":{"sx":738,"sy":873,"sw":124,"sh":86}},{"origin":{"x":1119.985992,"y":959.574074},"source":{"sx":1052,"sy":873,"sw":136,"sh":86}},{"origin":{"x":1439.985992,"y":959.574074},"source":{"sx":1378,"sy":873,"sw":124,"sh":86}},{"origin":{"x":1759.985992,"y":959.574074},"source":{"sx":1698,"sy":873,"sw":123,"sh":86}},{"origin":{"x":2079.985992,"y":959.574074},"source":{"sx":2021,"sy":873,"sw":118,"sh":86}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.31410675381263614,"worldBounds":{"maxX":216,"maxY":500,"maxZ":25,"minX":-216,"minY":140,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "turret-sentry": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":244.8,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160.0,"y":305.647743},"source":{"sx":82,"sy":53,"sw":157,"sh":253}},{"origin":{"x":480.0,"y":305.647743},"source":{"sx":395,"sy":48,"sw":170,"sh":258}},{"origin":{"x":800.0,"y":305.647743},"source":{"sx":717,"sy":40,"sw":166,"sh":266}},{"origin":{"x":1120.0,"y":305.647743},"source":{"sx":1052,"sy":34,"sw":136,"sh":272}},{"origin":{"x":1440.0,"y":305.647743},"source":{"sx":1357,"sy":34,"sw":166,"sh":272}},{"origin":{"x":1760.0,"y":305.647743},"source":{"sx":1675,"sy":34,"sw":170,"sh":272}},{"origin":{"x":2080.0,"y":305.647743},"source":{"sx":2002,"sy":34,"sw":157,"sh":272}},{"origin":{"x":160.0,"y":625.647743},"source":{"sx":82,"sy":436,"sw":157,"sh":190}},{"origin":{"x":480.0,"y":625.647743},"source":{"sx":395,"sy":433,"sw":170,"sh":193}},{"origin":{"x":800.0,"y":625.647743},"source":{"sx":719,"sy":429,"sw":162,"sh":197}},{"origin":{"x":1120.0,"y":625.647743},"source":{"sx":1052,"sy":427,"sw":136,"sh":199}},{"origin":{"x":1440.0,"y":625.647743},"source":{"sx":1359,"sy":427,"sw":162,"sh":199}},{"origin":{"x":1760.0,"y":625.647743},"source":{"sx":1677,"sy":427,"sw":166,"sh":199}},{"origin":{"x":2080.0,"y":625.647743},"source":{"sx":2002,"sy":427,"sw":157,"sh":199}},{"origin":{"x":160.0,"y":945.647743},"source":{"sx":82,"sy":844,"sw":157,"sh":102}},{"origin":{"x":480.0,"y":945.647743},"source":{"sx":395,"sy":844,"sw":170,"sh":102}},{"origin":{"x":800.0,"y":945.647743},"source":{"sx":719,"sy":844,"sw":162,"sh":102}},{"origin":{"x":1120.0,"y":945.647743},"source":{"sx":1052,"sy":844,"sw":136,"sh":102}},{"origin":{"x":1440.0,"y":945.647743},"source":{"sx":1360,"sy":844,"sw":161,"sh":102}},{"origin":{"x":1760.0,"y":945.647743},"source":{"sx":1675,"sy":844,"sw":170,"sh":102}},{"origin":{"x":2080.0,"y":945.647743},"source":{"sx":2002,"sy":844,"sw":157,"sh":102}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.27715301806997306,"worldBounds":{"maxX":244.8,"maxY":1900,"maxZ":25,"minX":-244.8,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "turret-heavy": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":244.8,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160.0,"y":305.647743},"source":{"sx":83,"sy":85,"sw":154,"sh":221}},{"origin":{"x":480.0,"y":305.647743},"source":{"sx":400,"sy":85,"sw":161,"sh":221}},{"origin":{"x":800.0,"y":305.647743},"source":{"sx":721,"sy":85,"sw":158,"sh":221}},{"origin":{"x":1120.0,"y":305.647743},"source":{"sx":1052,"sy":85,"sw":136,"sh":221}},{"origin":{"x":1440.0,"y":305.647743},"source":{"sx":1360,"sy":85,"sw":159,"sh":221}},{"origin":{"x":1760.0,"y":305.647743},"source":{"sx":1678,"sy":85,"sw":163,"sh":221}},{"origin":{"x":2080.0,"y":305.647743},"source":{"sx":2002,"sy":85,"sw":155,"sh":221}},{"origin":{"x":160.0,"y":625.647743},"source":{"sx":86,"sy":466,"sw":148,"sh":160}},{"origin":{"x":480.0,"y":625.647743},"source":{"sx":400,"sy":466,"sw":161,"sh":160}},{"origin":{"x":800.0,"y":625.647743},"source":{"sx":722,"sy":466,"sw":156,"sh":160}},{"origin":{"x":1120.0,"y":625.647743},"source":{"sx":1052,"sy":466,"sw":136,"sh":160}},{"origin":{"x":1440.0,"y":625.647743},"source":{"sx":1362,"sy":466,"sw":157,"sh":160}},{"origin":{"x":1760.0,"y":625.647743},"source":{"sx":1681,"sy":466,"sw":158,"sh":160}},{"origin":{"x":2080.0,"y":625.647743},"source":{"sx":2005,"sy":466,"sw":150,"sh":160}},{"origin":{"x":160.0,"y":945.647743},"source":{"sx":84,"sy":866,"sw":152,"sh":80}},{"origin":{"x":480.0,"y":945.647743},"source":{"sx":398,"sy":866,"sw":165,"sh":80}},{"origin":{"x":800.0,"y":945.647743},"source":{"sx":720,"sy":866,"sw":159,"sh":80}},{"origin":{"x":1120.0,"y":945.647743},"source":{"sx":1052,"sy":866,"sw":136,"sh":80}},{"origin":{"x":1440.0,"y":945.647743},"source":{"sx":1360,"sy":866,"sw":159,"sh":80}},{"origin":{"x":1760.0,"y":945.647743},"source":{"sx":1678,"sy":866,"sw":165,"sh":80}},{"origin":{"x":2080.0,"y":945.647743},"source":{"sx":2004,"sy":866,"sw":151,"sh":80}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.27715301806997306,"worldBounds":{"maxX":244.8,"maxY":1900,"maxZ":25,"minX":-244.8,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "barrier-rail": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":164.492279,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.991623,"y":299.277939},"source":{"sx":113,"sy":238,"sw":93,"sh":61}},{"origin":{"x":479.991623,"y":299.277939},"source":{"sx":413,"sy":238,"sw":133,"sh":61}},{"origin":{"x":799.991623,"y":299.277939},"source":{"sx":725,"sy":238,"sw":150,"sh":61}},{"origin":{"x":1119.991623,"y":299.277939},"source":{"sx":1052,"sy":238,"sw":136,"sh":61}},{"origin":{"x":1439.991623,"y":299.277939},"source":{"sx":1365,"sy":238,"sw":150,"sh":61}},{"origin":{"x":1759.991623,"y":299.277939},"source":{"sx":1693,"sy":238,"sw":133,"sh":61}},{"origin":{"x":2079.991623,"y":299.277939},"source":{"sx":2033,"sy":238,"sw":93,"sh":61}},{"origin":{"x":159.991623,"y":619.277939},"source":{"sx":113,"sy":566,"sw":93,"sh":53}},{"origin":{"x":479.991623,"y":619.277939},"source":{"sx":413,"sy":566,"sw":133,"sh":53}},{"origin":{"x":799.991623,"y":619.277939},"source":{"sx":725,"sy":566,"sw":150,"sh":53}},{"origin":{"x":1119.991623,"y":619.277939},"source":{"sx":1052,"sy":566,"sw":136,"sh":53}},{"origin":{"x":1439.991623,"y":619.277939},"source":{"sx":1365,"sy":566,"sw":150,"sh":53}},{"origin":{"x":1759.991623,"y":619.277939},"source":{"sx":1693,"sy":566,"sw":133,"sh":53}},{"origin":{"x":2079.991623,"y":619.277939},"source":{"sx":2033,"sy":566,"sw":93,"sh":53}},{"origin":{"x":159.991623,"y":939.277939},"source":{"sx":113,"sy":901,"sw":93,"sh":38}},{"origin":{"x":479.991623,"y":939.277939},"source":{"sx":413,"sy":901,"sw":133,"sh":38}},{"origin":{"x":799.991623,"y":939.277939},"source":{"sx":725,"sy":901,"sw":150,"sh":38}},{"origin":{"x":1119.991623,"y":939.277939},"source":{"sx":1052,"sy":901,"sw":136,"sh":38}},{"origin":{"x":1439.991623,"y":939.277939},"source":{"sx":1365,"sy":901,"sw":150,"sh":38}},{"origin":{"x":1759.991623,"y":939.277939},"source":{"sx":1693,"sy":901,"sw":133,"sh":38}},{"origin":{"x":2079.991623,"y":939.277939},"source":{"sx":2033,"sy":901,"sw":93,"sh":38}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":600,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "barrier-crate": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":30.019834,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.991623,"y":314.277939},"source":{"sx":141,"sy":218,"sw":38,"sh":96}},{"origin":{"x":479.991623,"y":314.277939},"source":{"sx":436,"sy":213,"sw":87,"sh":101}},{"origin":{"x":799.991623,"y":314.277939},"source":{"sx":739,"sy":213,"sw":122,"sh":101}},{"origin":{"x":1119.991623,"y":314.277939},"source":{"sx":1052,"sy":213,"sw":136,"sh":101}},{"origin":{"x":1439.991623,"y":314.277939},"source":{"sx":1379,"sy":213,"sw":122,"sh":101}},{"origin":{"x":1759.991623,"y":314.277939},"source":{"sx":1716,"sy":213,"sw":87,"sh":101}},{"origin":{"x":2079.991623,"y":314.277939},"source":{"sx":2062,"sy":213,"sw":36,"sh":101}},{"origin":{"x":159.991623,"y":634.277939},"source":{"sx":141,"sy":566,"sw":38,"sh":68}},{"origin":{"x":479.991623,"y":634.277939},"source":{"sx":436,"sy":566,"sw":87,"sh":68}},{"origin":{"x":799.991623,"y":634.277939},"source":{"sx":739,"sy":566,"sw":122,"sh":68}},{"origin":{"x":1119.991623,"y":634.277939},"source":{"sx":1052,"sy":566,"sw":136,"sh":68}},{"origin":{"x":1439.991623,"y":634.277939},"source":{"sx":1379,"sy":566,"sw":122,"sh":68}},{"origin":{"x":1759.991623,"y":634.277939},"source":{"sx":1716,"sy":566,"sw":87,"sh":68}},{"origin":{"x":2079.991623,"y":634.277939},"source":{"sx":2062,"sy":566,"sw":36,"sh":68}},{"origin":{"x":159.991623,"y":954.277939},"source":{"sx":141,"sy":925,"sw":38,"sh":29}},{"origin":{"x":479.991623,"y":954.277939},"source":{"sx":436,"sy":925,"sw":87,"sh":29}},{"origin":{"x":799.991623,"y":954.277939},"source":{"sx":739,"sy":925,"sw":122,"sh":29}},{"origin":{"x":1119.991623,"y":954.277939},"source":{"sx":1052,"sy":925,"sw":136,"sh":29}},{"origin":{"x":1439.991623,"y":954.277939},"source":{"sx":1379,"sy":925,"sw":122,"sh":29}},{"origin":{"x":1759.991623,"y":954.277939},"source":{"sx":1716,"sy":925,"sw":87,"sh":29}},{"origin":{"x":2079.991623,"y":954.277939},"source":{"sx":2062,"sy":925,"sw":36,"sh":29}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":600,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-pylon": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":323.983811,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.984497,"y":294.755295},"source":{"sx":85,"sy":1,"sw":150,"sh":318}},{"origin":{"x":479.984497,"y":294.755295},"source":{"sx":400,"sy":1,"sw":160,"sh":318}},{"origin":{"x":799.984497,"y":294.755295},"source":{"sx":724,"sy":1,"sw":152,"sh":318}},{"origin":{"x":1119.984497,"y":294.755295},"source":{"sx":1052,"sy":1,"sw":136,"sh":318}},{"origin":{"x":1439.984497,"y":294.755295},"source":{"sx":1366,"sy":1,"sw":148,"sh":318}},{"origin":{"x":1759.984497,"y":294.755295},"source":{"sx":1683,"sy":1,"sw":153,"sh":318}},{"origin":{"x":2079.984497,"y":294.755295},"source":{"sx":2008,"sy":1,"sw":144,"sh":318}},{"origin":{"x":159.984497,"y":614.755295},"source":{"sx":88,"sy":368,"sw":143,"sh":247}},{"origin":{"x":479.984497,"y":614.755295},"source":{"sx":402,"sy":368,"sw":155,"sh":247}},{"origin":{"x":799.984497,"y":614.755295},"source":{"sx":722,"sy":368,"sw":156,"sh":247}},{"origin":{"x":1119.984497,"y":614.755295},"source":{"sx":1052,"sy":368,"sw":136,"sh":247}},{"origin":{"x":1439.984497,"y":614.755295},"source":{"sx":1364,"sy":368,"sw":152,"sh":247}},{"origin":{"x":1759.984497,"y":614.755295},"source":{"sx":1686,"sy":368,"sw":148,"sh":247}},{"origin":{"x":2079.984497,"y":614.755295},"source":{"sx":2011,"sy":368,"sw":137,"sh":247}},{"origin":{"x":159.984497,"y":934.755295},"source":{"sx":91,"sy":749,"sw":138,"sh":186}},{"origin":{"x":479.984497,"y":934.755295},"source":{"sx":402,"sy":749,"sw":155,"sh":186}},{"origin":{"x":799.984497,"y":934.755295},"source":{"sx":720,"sy":749,"sw":159,"sh":186}},{"origin":{"x":1119.984497,"y":934.755295},"source":{"sx":1052,"sy":749,"sw":136,"sh":186}},{"origin":{"x":1439.984497,"y":934.755295},"source":{"sx":1361,"sy":749,"sw":157,"sh":186}},{"origin":{"x":1759.984497,"y":934.755295},"source":{"sx":1684,"sy":749,"sw":151,"sh":186}},{"origin":{"x":2079.984497,"y":934.755295},"source":{"sx":2014,"sy":749,"sw":132,"sh":186}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":1250,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-bastion": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":138.014557,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.984497,"y":307.755295},"source":{"sx":122,"sy":177,"sw":75,"sh":131}},{"origin":{"x":479.984497,"y":307.755295},"source":{"sx":430,"sy":177,"sw":100,"sh":131}},{"origin":{"x":799.984497,"y":307.755295},"source":{"sx":737,"sy":177,"sw":125,"sh":131}},{"origin":{"x":1119.984497,"y":307.755295},"source":{"sx":1052,"sy":177,"sw":136,"sh":131}},{"origin":{"x":1439.984497,"y":307.755295},"source":{"sx":1377,"sy":177,"sw":125,"sh":131}},{"origin":{"x":1759.984497,"y":307.755295},"source":{"sx":1710,"sy":177,"sw":100,"sh":131}},{"origin":{"x":2079.984497,"y":307.755295},"source":{"sx":2042,"sy":177,"sw":75,"sh":131}},{"origin":{"x":159.984497,"y":627.755295},"source":{"sx":122,"sy":530,"sw":75,"sh":98}},{"origin":{"x":479.984497,"y":627.755295},"source":{"sx":430,"sy":530,"sw":100,"sh":98}},{"origin":{"x":799.984497,"y":627.755295},"source":{"sx":737,"sy":530,"sw":125,"sh":98}},{"origin":{"x":1119.984497,"y":627.755295},"source":{"sx":1052,"sy":530,"sw":136,"sh":98}},{"origin":{"x":1439.984497,"y":627.755295},"source":{"sx":1377,"sy":530,"sw":125,"sh":98}},{"origin":{"x":1759.984497,"y":627.755295},"source":{"sx":1710,"sy":530,"sw":100,"sh":98}},{"origin":{"x":2079.984497,"y":627.755295},"source":{"sx":2042,"sy":530,"sw":75,"sh":98}},{"origin":{"x":159.984497,"y":947.755295},"source":{"sx":122,"sy":898,"sw":75,"sh":50}},{"origin":{"x":479.984497,"y":947.755295},"source":{"sx":431,"sy":898,"sw":98,"sh":50}},{"origin":{"x":799.984497,"y":947.755295},"source":{"sx":737,"sy":898,"sw":126,"sh":50}},{"origin":{"x":1119.984497,"y":947.755295},"source":{"sx":1052,"sy":898,"sw":136,"sh":50}},{"origin":{"x":1439.984497,"y":947.755295},"source":{"sx":1377,"sy":898,"sw":126,"sh":50}},{"origin":{"x":1759.984497,"y":947.755295},"source":{"sx":1710,"sy":898,"sw":99,"sh":50}},{"origin":{"x":2079.984497,"y":947.755295},"source":{"sx":2042,"sy":898,"sw":75,"sh":50}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":1250,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-reactor": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":159.780824,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.988251,"y":313.039001},"source":{"sx":116,"sy":1,"sw":88,"sh":318}},{"origin":{"x":479.988251,"y":313.039001},"source":{"sx":424,"sy":1,"sw":112,"sh":318}},{"origin":{"x":799.988251,"y":313.039001},"source":{"sx":733,"sy":1,"sw":133,"sh":318}},{"origin":{"x":1119.988251,"y":313.039001},"source":{"sx":1052,"sy":1,"sw":136,"sh":318}},{"origin":{"x":1439.988251,"y":313.039001},"source":{"sx":1373,"sy":1,"sw":133,"sh":318}},{"origin":{"x":1759.988251,"y":313.039001},"source":{"sx":1702,"sy":1,"sw":116,"sh":318}},{"origin":{"x":2079.988251,"y":313.039001},"source":{"sx":2034,"sy":1,"sw":92,"sh":318}},{"origin":{"x":159.988251,"y":633.039001},"source":{"sx":114,"sy":425,"sw":92,"sh":208}},{"origin":{"x":479.988251,"y":633.039001},"source":{"sx":422,"sy":425,"sw":116,"sh":208}},{"origin":{"x":799.988251,"y":633.039001},"source":{"sx":733,"sy":425,"sw":133,"sh":208}},{"origin":{"x":1119.988251,"y":633.039001},"source":{"sx":1052,"sy":425,"sw":136,"sh":208}},{"origin":{"x":1439.988251,"y":633.039001},"source":{"sx":1372,"sy":425,"sw":136,"sh":208}},{"origin":{"x":1759.988251,"y":633.039001},"source":{"sx":1704,"sy":425,"sw":112,"sh":208}},{"origin":{"x":2079.988251,"y":633.039001},"source":{"sx":2034,"sy":425,"sw":92,"sh":208}},{"origin":{"x":159.988251,"y":953.039001},"source":{"sx":116,"sy":863,"sw":88,"sh":90}},{"origin":{"x":479.988251,"y":953.039001},"source":{"sx":422,"sy":863,"sw":116,"sh":90}},{"origin":{"x":799.988251,"y":953.039001},"source":{"sx":733,"sy":863,"sw":133,"sh":90}},{"origin":{"x":1119.988251,"y":953.039001},"source":{"sx":1052,"sy":863,"sw":136,"sh":90}},{"origin":{"x":1439.988251,"y":953.039001},"source":{"sx":1372,"sy":863,"sw":136,"sh":90}},{"origin":{"x":1759.988251,"y":953.039001},"source":{"sx":1704,"sy":863,"sw":112,"sh":90}},{"origin":{"x":2079.988251,"y":953.039001},"source":{"sx":2036,"sy":863,"sw":88,"sh":90}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":2000,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-tower": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":323.983814,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.988251,"y":303.039001},"source":{"sx":89,"sy":1,"sw":141,"sh":318}},{"origin":{"x":479.988251,"y":303.039001},"source":{"sx":401,"sy":1,"sw":158,"sh":318}},{"origin":{"x":799.988251,"y":303.039001},"source":{"sx":726,"sy":1,"sw":148,"sh":318}},{"origin":{"x":1119.988251,"y":303.039001},"source":{"sx":1052,"sy":1,"sw":136,"sh":318}},{"origin":{"x":1439.988251,"y":303.039001},"source":{"sx":1366,"sy":1,"sw":147,"sh":318}},{"origin":{"x":1759.988251,"y":303.039001},"source":{"sx":1686,"sy":1,"sw":148,"sh":318}},{"origin":{"x":2079.988251,"y":303.039001},"source":{"sx":2014,"sy":1,"sw":132,"sh":318}},{"origin":{"x":159.988251,"y":623.039001},"source":{"sx":91,"sy":371,"sw":138,"sh":252}},{"origin":{"x":479.988251,"y":623.039001},"source":{"sx":402,"sy":371,"sw":155,"sh":252}},{"origin":{"x":799.988251,"y":623.039001},"source":{"sx":723,"sy":371,"sw":153,"sh":252}},{"origin":{"x":1119.988251,"y":623.039001},"source":{"sx":1052,"sy":371,"sw":136,"sh":252}},{"origin":{"x":1439.988251,"y":623.039001},"source":{"sx":1364,"sy":371,"sw":152,"sh":252}},{"origin":{"x":1759.988251,"y":623.039001},"source":{"sx":1686,"sy":371,"sw":148,"sh":252}},{"origin":{"x":2079.988251,"y":623.039001},"source":{"sx":2016,"sy":371,"sw":128,"sh":252}},{"origin":{"x":159.988251,"y":943.039001},"source":{"sx":93,"sy":792,"sw":134,"sh":151}},{"origin":{"x":479.988251,"y":943.039001},"source":{"sx":400,"sy":792,"sw":160,"sh":151}},{"origin":{"x":799.988251,"y":943.039001},"source":{"sx":720,"sy":792,"sw":160,"sh":151}},{"origin":{"x":1119.988251,"y":943.039001},"source":{"sx":1052,"sy":792,"sw":136,"sh":151}},{"origin":{"x":1439.988251,"y":943.039001},"source":{"sx":1360,"sy":792,"sw":159,"sh":151}},{"origin":{"x":1759.988251,"y":943.039001},"source":{"sx":1680,"sy":792,"sw":159,"sh":151}},{"origin":{"x":2079.988251,"y":943.039001},"source":{"sx":2014,"sy":792,"sw":132,"sh":151}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":2000,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "corridor-low": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":164.492279,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.991623,"y":299.277939},"source":{"sx":113,"sy":224,"sw":93,"sh":75}},{"origin":{"x":479.991623,"y":299.277939},"source":{"sx":413,"sy":224,"sw":133,"sh":75}},{"origin":{"x":799.991623,"y":299.277939},"source":{"sx":725,"sy":224,"sw":150,"sh":75}},{"origin":{"x":1119.991623,"y":299.277939},"source":{"sx":1052,"sy":224,"sw":136,"sh":75}},{"origin":{"x":1439.991623,"y":299.277939},"source":{"sx":1365,"sy":224,"sw":150,"sh":75}},{"origin":{"x":1759.991623,"y":299.277939},"source":{"sx":1693,"sy":224,"sw":133,"sh":75}},{"origin":{"x":2079.991623,"y":299.277939},"source":{"sx":2033,"sy":224,"sw":93,"sh":75}},{"origin":{"x":159.991623,"y":619.277939},"source":{"sx":113,"sy":553,"sw":93,"sh":66}},{"origin":{"x":479.991623,"y":619.277939},"source":{"sx":413,"sy":553,"sw":133,"sh":66}},{"origin":{"x":799.991623,"y":619.277939},"source":{"sx":725,"sy":553,"sw":150,"sh":66}},{"origin":{"x":1119.991623,"y":619.277939},"source":{"sx":1052,"sy":553,"sw":136,"sh":66}},{"origin":{"x":1439.991623,"y":619.277939},"source":{"sx":1365,"sy":553,"sw":150,"sh":66}},{"origin":{"x":1759.991623,"y":619.277939},"source":{"sx":1693,"sy":553,"sw":133,"sh":66}},{"origin":{"x":2079.991623,"y":619.277939},"source":{"sx":2033,"sy":553,"sw":93,"sh":66}},{"origin":{"x":159.991623,"y":939.277939},"source":{"sx":113,"sy":892,"sw":93,"sh":47}},{"origin":{"x":479.991623,"y":939.277939},"source":{"sx":413,"sy":892,"sw":133,"sh":47}},{"origin":{"x":799.991623,"y":939.277939},"source":{"sx":725,"sy":892,"sw":150,"sh":47}},{"origin":{"x":1119.991623,"y":939.277939},"source":{"sx":1052,"sy":892,"sw":136,"sh":47}},{"origin":{"x":1439.991623,"y":939.277939},"source":{"sx":1365,"sy":892,"sw":150,"sh":47}},{"origin":{"x":1759.991623,"y":939.277939},"source":{"sx":1693,"sy":892,"sw":133,"sh":47}},{"origin":{"x":2079.991623,"y":939.277939},"source":{"sx":2033,"sy":892,"sw":93,"sh":47}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":600,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "corridor-medium": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":323.983817,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.984497,"y":294.755295},"source":{"sx":84,"sy":136,"sw":152,"sh":159}},{"origin":{"x":479.984497,"y":294.755295},"source":{"sx":394,"sy":136,"sw":172,"sh":159}},{"origin":{"x":799.984497,"y":294.755295},"source":{"sx":715,"sy":136,"sw":170,"sh":159}},{"origin":{"x":1119.984497,"y":294.755295},"source":{"sx":1052,"sy":136,"sw":136,"sh":159}},{"origin":{"x":1439.984497,"y":294.755295},"source":{"sx":1355,"sy":136,"sw":170,"sh":159}},{"origin":{"x":1759.984497,"y":294.755295},"source":{"sx":1674,"sy":136,"sw":172,"sh":159}},{"origin":{"x":2079.984497,"y":294.755295},"source":{"sx":2004,"sy":137,"sw":152,"sh":158}},{"origin":{"x":159.984497,"y":614.755295},"source":{"sx":84,"sy":492,"sw":152,"sh":123}},{"origin":{"x":479.984497,"y":614.755295},"source":{"sx":394,"sy":492,"sw":172,"sh":123}},{"origin":{"x":799.984497,"y":614.755295},"source":{"sx":715,"sy":492,"sw":170,"sh":123}},{"origin":{"x":1119.984497,"y":614.755295},"source":{"sx":1052,"sy":492,"sw":136,"sh":123}},{"origin":{"x":1439.984497,"y":614.755295},"source":{"sx":1355,"sy":492,"sw":170,"sh":123}},{"origin":{"x":1759.984497,"y":614.755295},"source":{"sx":1674,"sy":492,"sw":172,"sh":123}},{"origin":{"x":2079.984497,"y":614.755295},"source":{"sx":2004,"sy":492,"sw":152,"sh":123}},{"origin":{"x":159.984497,"y":934.755295},"source":{"sx":84,"sy":841,"sw":152,"sh":94}},{"origin":{"x":479.984497,"y":934.755295},"source":{"sx":394,"sy":841,"sw":172,"sh":94}},{"origin":{"x":799.984497,"y":934.755295},"source":{"sx":715,"sy":841,"sw":170,"sh":94}},{"origin":{"x":1119.984497,"y":934.755295},"source":{"sx":1052,"sy":841,"sw":136,"sh":94}},{"origin":{"x":1439.984497,"y":934.755295},"source":{"sx":1355,"sy":841,"sw":170,"sh":94}},{"origin":{"x":1759.984497,"y":934.755295},"source":{"sx":1674,"sy":841,"sw":172,"sh":94}},{"origin":{"x":2079.984497,"y":934.755295},"source":{"sx":2004,"sy":841,"sw":152,"sh":94}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.20940450254175744,"worldBounds":{"maxX":324,"maxY":1250,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
    });
  })();

  function uprightAtlas(id, path, category, variant) {
    const generated = GENERATED_UPRIGHT_ATLAS_DATA[id];
    if (!generated) throw new Error(`Missing generated upright metadata for ${id}`);
    return Object.freeze({ ...generated, path, category, variant });
  }

  function roadEdgeAtlas(path, category, variant) {
    return Object.freeze({
      path,
      category,
      variant,
      layout: 'roadEdge',
      atlasWidth: 3584,
      atlasHeight: 512,
      frameWidth: 512,
      frameHeight: 512,
      yawDegrees: LEGACY_YAW_DEGREES,
      frames: 7,
    });
  }

  const WORLD_ATLAS_MANIFEST = Object.freeze({
    droneScout: uprightAtlas('drone-scout', './assets/world/semantic/drone-scout.png', 'drone', 0),
    droneStriker: uprightAtlas('drone-striker', './assets/world/semantic/drone-striker.png', 'drone', 1),
    turretSentry: uprightAtlas('turret-sentry', './assets/world/semantic/turret-sentry.png', 'turret', 0),
    turretHeavy: uprightAtlas('turret-heavy', './assets/world/semantic/turret-heavy.png', 'turret', 1),
    barrierRail: uprightAtlas('barrier-rail', './assets/world/semantic/barrier-rail.png', 'wallLow', 0),
    barrierCrate: uprightAtlas('barrier-crate', './assets/world/semantic/barrier-crate.png', 'wallLow', 1),
    structurePylon: uprightAtlas('structure-pylon', './assets/world/semantic/structure-pylon.png', 'wallMedium', 0),
    structureBastion: uprightAtlas('structure-bastion', './assets/world/semantic/structure-bastion.png', 'wallMedium', 1),
    structureReactor: uprightAtlas('structure-reactor', './assets/world/semantic/structure-reactor.png', 'wallHigh', 0),
    structureTower: uprightAtlas('structure-tower', './assets/world/semantic/structure-tower.png', 'wallHigh', 1),
    corridorLow: uprightAtlas('corridor-low', './assets/world/semantic/corridor-low.png', 'corridorLow', 0),
    corridorMedium: uprightAtlas('corridor-medium', './assets/world/semantic/corridor-medium.png', 'corridorMedium', 0),
    gapEdge: roadEdgeAtlas('./assets/world/semantic/gap-edge.png', 'gap', 0),
  });

  const WORLD_GEOMETRY = Object.freeze({
    drone: Object.freeze({ worldWidth: 432, worldHeight: 360, baseY: 140 }),
    turret: Object.freeze({ worldWidth: 489.6, worldHeight: 1900, baseY: 0, weaponMountHeight: 1120 }),
    wallLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
    wallMedium: Object.freeze({ worldWidth: 648, worldHeight: 1250, baseY: 0 }),
    wallHigh: Object.freeze({ worldWidth: 648, worldHeight: 2000, baseY: 0 }),
    corridorLow: Object.freeze({ worldWidth: 648, worldHeight: 600, baseY: 0 }),
    corridorMedium: Object.freeze({ worldWidth: 648, worldHeight: 1250, baseY: 0 }),
  });

  function selectAxisBlend(angle, samples) {
    const value = Math.max(samples[0], Math.min(samples[samples.length - 1], Number(angle) || 0));
    let upperIndex = samples.findIndex((sample) => sample >= value);
    if (upperIndex < 0) upperIndex = samples.length - 1;
    const lowerIndex = Math.max(0, upperIndex - (samples[upperIndex] === value ? 0 : 1));
    if (lowerIndex === upperIndex) {
      return Object.freeze({ angle: value, lowerIndex, upperIndex, mix: 0 });
    }
    const span = samples[upperIndex] - samples[lowerIndex];
    return Object.freeze({
      angle: value,
      lowerIndex,
      upperIndex,
      mix: (value - samples[lowerIndex]) / span,
    });
  }

  function selectViewBlend({
    worldX,
    zRel,
    cameraY,
    objectY = 0,
    worldBounds,
    viewProfile = 'airborne',
    laneOffset = null,
  } = {}) {
    const bounds = worldBounds || { minY: 0, maxY: 0 };
    const depth = Math.max(1, Number(zRel) || 1);
    const lateral = Number(worldX) || 0;
    const profile = VIEW_PROFILES[viewProfile] || VIEW_PROFILES.airborne;
    const requestedYaw = Math.atan2(lateral, depth) * 180 / Math.PI;
    const groundedLaneOffset = Number(laneOffset);
    const laneYaw = Number.isFinite(groundedLaneOffset)
      ? groundedLaneOffset * 6 * Math.min(1, 1200 / depth)
      : requestedYaw;
    const yawAngle = Math.max(profile.minYaw, Math.min(profile.maxYaw,
      viewProfile === 'grounded' ? laneYaw : requestedYaw));
    const centerY = (Number(objectY) || 0) + (Number(bounds.minY) + Number(bounds.maxY)) / 2;
    const horizontalDistance = Math.max(1, Math.hypot(lateral, depth));
    const pitchAngle = Math.atan2((Number(cameraY) || 0) - centerY, horizontalDistance) * 180 / Math.PI;
    return Object.freeze({
      yaw: selectAxisBlend(yawAngle, YAW_DEGREES),
      pitch: selectAxisBlend(pitchAngle, PITCH_DEGREES),
    });
  }

  function selectYawBlend({ worldX = 0, zRel = 1 } = {}) {
    const x = Number.isFinite(Number(worldX)) ? Number(worldX) : 0;
    const depth = Math.max(1, Number.isFinite(Number(zRel)) ? Number(zRel) : 1);
    const angle = Math.atan2(x, depth) * 180 / Math.PI;
    return selectAxisBlend(angle, LEGACY_YAW_DEGREES);
  }

  function atlasFrameRect(metadata, frameIndex) {
    const index = Math.max(0, Math.min(metadata.frames - 1, Math.trunc(frameIndex)));
    return Object.freeze({
      sx: index * metadata.frameWidth,
      sy: 0,
      sw: metadata.frameWidth,
      sh: metadata.frameHeight,
    });
  }

  function frozenSource(source) {
    if (!source || typeof source !== 'object') return null;
    return Object.freeze({
      sx: Number(source.sx),
      sy: Number(source.sy),
      sw: Number(source.sw),
      sh: Number(source.sh),
    });
  }

  function atlasFrame(metadata, yawIndex, pitchIndex) {
    if (!metadata || !Array.isArray(metadata.frames)) return null;
    const yaw = Math.trunc(Number(yawIndex));
    const pitch = Math.trunc(Number(pitchIndex));
    if (yaw < 0 || yaw >= YAW_DEGREES.length || pitch < 0 || pitch >= PITCH_DEGREES.length) return null;
    const frame = metadata.frames[pitch * YAW_DEGREES.length + yaw];
    if (!frame || !frame.source || !frame.origin) return null;
    return Object.freeze({
      source: frozenSource(frame.source),
      origin: Object.freeze({ x: Number(frame.origin.x), y: Number(frame.origin.y) }),
    });
  }

  function hasOwn(array, index) {
    return Object.prototype.hasOwnProperty.call(array, index);
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function sameNumbers(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    for (let index = 0; index < expected.length; index += 1) {
      if (!hasOwn(actual, index) || actual[index] !== expected[index]) return false;
    }
    return true;
  }

  function hasOwnProperties(value, keys) {
    return value
      && typeof value === 'object'
      && keys.every((key) => hasOwn(value, key));
  }

  function finiteBounds(bounds) {
    const keys = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];
    return bounds
      && typeof bounds === 'object'
      && hasOwnProperties(bounds, keys)
      && keys.every((key) => isFiniteNumber(bounds[key]))
      && bounds.maxX > bounds.minX
      && bounds.maxY > bounds.minY
      && bounds.maxZ > bounds.minZ;
  }

  const metadataValidationCache = new WeakMap();

  function isRecursivelyFrozen(value, seen = new Set()) {
    if (!value || typeof value !== 'object') return true;
    if (seen.has(value)) return true;
    if (!Object.isFrozen(value)) return false;
    seen.add(value);
    return Reflect.ownKeys(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor
        && hasOwn(descriptor, 'value')
        && isRecursivelyFrozen(descriptor.value, seen);
    });
  }

  function validateRoadEdgeMetadata(metadata) {
    return hasOwnProperties(metadata, [
      'layout', 'atlasWidth', 'atlasHeight', 'frameWidth', 'frameHeight', 'yawDegrees', 'frames',
    ])
      && metadata.layout === 'roadEdge'
      && metadata.atlasWidth === 3584
      && metadata.atlasHeight === 512
      && metadata.frameWidth === 512
      && metadata.frameHeight === 512
      && sameNumbers(metadata.yawDegrees, LEGACY_YAW_DEGREES)
      && metadata.frames === LEGACY_YAW_DEGREES.length;
  }

  function validateUprightMetadata(metadata) {
    if (!hasOwnProperties(metadata, [
      'layout', 'atlasWidth', 'atlasHeight', 'frameWidth', 'frameHeight',
      'yawDegrees', 'pitchDegrees', 'detailFrontZ', 'worldBounds', 'pixelsPerWorldUnit', 'frames',
    ])
      || metadata.layout !== 'upright'
      || metadata.atlasWidth !== 2240
      || metadata.atlasHeight !== 960
      || metadata.frameWidth !== 320
      || metadata.frameHeight !== 320
      || !sameNumbers(metadata.yawDegrees, YAW_DEGREES)
      || !sameNumbers(metadata.pitchDegrees, PITCH_DEGREES)
      || !isFiniteNumber(metadata.detailFrontZ)
      || metadata.detailFrontZ <= 0
      || !finiteBounds(metadata.worldBounds)
      || !isFiniteNumber(metadata.pixelsPerWorldUnit)
      || metadata.pixelsPerWorldUnit <= 0
      || !Array.isArray(metadata.frames)
      || metadata.frames.length !== YAW_DEGREES.length * PITCH_DEGREES.length) return false;

    for (let index = 0; index < metadata.frames.length; index += 1) {
      if (!hasOwn(metadata.frames, index)) return false;
      const frame = metadata.frames[index];
      if (!frame || typeof frame !== 'object'
        || !hasOwnProperties(frame, ['source', 'origin'])
        || !hasOwnProperties(frame.source, ['sx', 'sy', 'sw', 'sh'])
        || !hasOwnProperties(frame.origin, ['x', 'y'])) return false;
      const { sx, sy, sw, sh } = frame.source;
      if (![sx, sy, sw, sh].every(Number.isInteger)) return false;
      if (sw <= 0 || sh <= 0 || sx < 0 || sy < 0) return false;
      if (sx + sw > metadata.atlasWidth || sy + sh > metadata.atlasHeight) return false;
      const column = index % YAW_DEGREES.length;
      const row = Math.floor(index / YAW_DEGREES.length);
      const cellMinX = column * metadata.frameWidth;
      const cellMinY = row * metadata.frameHeight;
      if (sx < cellMinX || sx + sw > cellMinX + metadata.frameWidth
        || sy < cellMinY || sy + sh > cellMinY + metadata.frameHeight) return false;
      if (!isFiniteNumber(frame.origin.x) || !isFiniteNumber(frame.origin.y)) return false;
    }
    return true;
  }

  function validateAtlasMetadata(metadata) {
    try {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
      if (metadataValidationCache.has(metadata)) return metadataValidationCache.get(metadata);
      const valid = metadata.layout === 'upright'
        ? validateUprightMetadata(metadata)
        : validateRoadEdgeMetadata(metadata);
      if (isRecursivelyFrozen(metadata)) metadataValidationCache.set(metadata, valid);
      return valid;
    } catch (_error) {
      return false;
    }
  }

  function legacySpriteDrawPlan({ metadata, worldX, zRel, destination, alpha = 1 }) {
    const blend = selectYawBlend({ worldX, zRel });
    return legacyShapedPlan({
      lower: atlasFrameRect(metadata, blend.lowerIndex),
      upper: atlasFrameRect(metadata, blend.upperIndex),
      mix: blend.mix,
      destination,
      alpha,
    });
  }

  function legacyShapedPlan({ lower, upper, mix, destination, alpha }) {
    const frozenDestination = Object.freeze({
      x: Number(destination.x),
      y: Number(destination.y),
      width: Math.max(0, Number(destination.width)),
      height: Math.max(0, Number(destination.height)),
    });
    return Object.freeze({
      lower,
      upper,
      mix,
      destination: frozenDestination,
      alpha: Math.max(0, Math.min(1, Number(alpha) || 0)),
    });
  }

  function uprightLegacySpriteDrawPlan({ metadata, worldX, zRel, destination, alpha = 1 }) {
    if (!validateAtlasMetadata(metadata)) return null;
    const x = Number.isFinite(Number(worldX)) ? Number(worldX) : 0;
    const depth = Math.max(1, Number.isFinite(Number(zRel)) ? Number(zRel) : 1);
    const yawAngle = Math.atan2(x, depth) * 180 / Math.PI;
    const blend = selectAxisBlend(yawAngle, YAW_DEGREES);
    const centerPitchIndex = Math.floor(PITCH_DEGREES.length / 2);
    const lower = atlasFrame(metadata, blend.lowerIndex, centerPitchIndex);
    const upper = atlasFrame(metadata, blend.upperIndex, centerPitchIndex);
    if (!lower || !upper) return null;
    return legacyShapedPlan({
      lower: lower.source,
      upper: upper.source,
      mix: blend.mix,
      destination,
      alpha,
    });
  }

  function buildUprightDrawPlan(options) {
    const {
      metadata,
      worldX,
      zRel,
      cameraY,
      objectY = 0,
      projectedOrigin,
      pixelsPerWorldUnitX,
      pixelsPerWorldUnitY,
      alpha = 1,
      viewProfile = 'airborne',
      laneOffset = null,
    } = options;
    if (!validateAtlasMetadata(metadata)
      || !projectedOrigin
      || !Number.isFinite(Number(projectedOrigin.x))
      || !Number.isFinite(Number(projectedOrigin.y))
      || !Number.isFinite(Number(pixelsPerWorldUnitX))
      || !Number.isFinite(Number(pixelsPerWorldUnitY))
      || Number(pixelsPerWorldUnitX) <= 0
      || Number(pixelsPerWorldUnitY) <= 0) return null;

    const view = selectViewBlend({
      worldX,
      zRel,
      cameraY,
      objectY,
      worldBounds: metadata.worldBounds,
      viewProfile,
      laneOffset,
    });
    const groundedProfile = viewProfile === 'grounded';
    const yawParts = groundedProfile
      ? [{ index: Math.floor(YAW_DEGREES.length / 2), weight: 1 }]
      : view.yaw.lowerIndex === view.yaw.upperIndex
      ? [{ index: view.yaw.lowerIndex, weight: 1 }]
      : [
        { index: view.yaw.lowerIndex, weight: 1 - view.yaw.mix },
        { index: view.yaw.upperIndex, weight: view.yaw.mix },
      ];
    const pitchParts = groundedProfile
      ? [{ index: 1, weight: 1 }]
      : view.pitch.lowerIndex === view.pitch.upperIndex
      ? [{ index: view.pitch.lowerIndex, weight: 1 }]
      : [
        { index: view.pitch.lowerIndex, weight: 1 - view.pitch.mix },
        { index: view.pitch.upperIndex, weight: view.pitch.mix },
      ];
    const weightedFrames = new Map();
    for (const pitch of pitchParts) {
      for (const yaw of yawParts) {
        const weight = pitch.weight * yaw.weight;
        if (weight <= 0) continue;
        const index = pitch.index * YAW_DEGREES.length + yaw.index;
        weightedFrames.set(index, (weightedFrames.get(index) || 0) + weight);
      }
    }
    const totalWeight = [...weightedFrames.values()].reduce((sum, weight) => sum + weight, 0);
    if (!(totalWeight > 0)) return null;

    const projectedX = Number(projectedOrigin.x);
    const projectedY = Number(projectedOrigin.y);
    const runtimeScaleX = Number(pixelsPerWorldUnitX);
    const runtimeScaleY = Number(pixelsPerWorldUnitY);
    const sourceScale = Number(metadata.pixelsPerWorldUnit);
    const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    const draws = [];
    for (const [index, rawWeight] of weightedFrames) {
      const yawIndex = index % YAW_DEGREES.length;
      const pitchIndex = Math.floor(index / YAW_DEGREES.length);
      const frame = atlasFrame(metadata, yawIndex, pitchIndex);
      if (!frame) return null;
      const weight = rawWeight / totalWeight;
      const destination = Object.freeze({
        x: projectedX - (frame.origin.x - frame.source.sx) / sourceScale * runtimeScaleX,
        y: projectedY - (frame.origin.y - frame.source.sy) / sourceScale * runtimeScaleY,
        width: frame.source.sw / sourceScale * runtimeScaleX,
        height: frame.source.sh / sourceScale * runtimeScaleY,
      });
      draws.push(Object.freeze({
        source: frame.source,
        destination,
        weight,
        alpha: clampedAlpha * weight,
      }));
    }

    const minX = Math.min(...draws.map(({ destination }) => destination.x));
    const minY = Math.min(...draws.map(({ destination }) => destination.y));
    const maxX = Math.max(...draws.map(({ destination }) => destination.x + destination.width));
    const maxY = Math.max(...draws.map(({ destination }) => destination.y + destination.height));
    const bounds = Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    return Object.freeze({
      yaw: view.yaw,
      pitch: view.pitch,
      bounds,
      draws: Object.freeze(draws),
    });
  }

  function buildSpriteDrawPlan(options = {}) {
    const { metadata, destination } = options;
    if (metadata && metadata.layout === 'upright') {
      if (destination && typeof destination === 'object' && !options.projectedOrigin) {
        return uprightLegacySpriteDrawPlan(options);
      }
      return buildUprightDrawPlan(options);
    }
    if (metadata && metadata.layout === 'roadEdge') {
      if (!validateAtlasMetadata(metadata) || !destination || typeof destination !== 'object') return null;
      return legacySpriteDrawPlan(options);
    }
    if (!metadata || metadata.layout != null || !destination || typeof destination !== 'object') return null;
    return legacySpriteDrawPlan(options);
  }

  function roadEdgeFrame(metadata) {
    if (!validateAtlasMetadata(metadata) || metadata.layout !== 'roadEdge') return null;
    return atlasFrameRect(metadata, Math.floor(metadata.frames / 2));
  }

  function worldSpriteDrawRect({ projectPoint, worldX, zRel, worldWidth, worldHeight, baseY = 0 }) {
    const left = projectPoint(worldX - worldWidth / 2, baseY, zRel);
    const right = projectPoint(worldX + worldWidth / 2, baseY, zRel);
    const bottom = projectPoint(worldX, baseY, zRel);
    const top = projectPoint(worldX, baseY + worldHeight, zRel);
    const width = Math.abs(right.x - left.x);
    const height = Math.abs(bottom.y - top.y);
    return Object.freeze({ x: bottom.x - width / 2, y: bottom.y - height, width, height });
  }

  function projectedLaneEnvelope({
    projectPoint,
    worldX,
    zRel,
    laneWidth,
    footprintWidth,
    baseY = 0,
  } = {}) {
    if (typeof projectPoint !== 'function'
      || !Number.isFinite(Number(worldX))
      || !(Number(zRel) > 0)
      || !(Number(laneWidth) > 0)
      || !(Number(footprintWidth) > 0)
      || Number(footprintWidth) > Number(laneWidth)
      || !Number.isFinite(Number(baseY))) return null;
    const centerX = Number(worldX);
    const depth = Number(zRel);
    const y = Number(baseY);
    const lane = Number(laneWidth);
    const footprint = Number(footprintWidth);
    const laneCenter = projectPoint(centerX, y, depth);
    const laneLeft = projectPoint(centerX - lane / 2, y, depth);
    const laneRight = projectPoint(centerX + lane / 2, y, depth);
    const footprintLeft = projectPoint(centerX - footprint / 2, y, depth);
    const footprintRight = projectPoint(centerX + footprint / 2, y, depth);
    const adjacentLeftCenter = projectPoint(centerX - lane, y, depth);
    const adjacentRightCenter = projectPoint(centerX + lane, y, depth);
    const footprintCenter = Object.freeze({
      x: (footprintLeft.x + footprintRight.x) / 2,
      y: (footprintLeft.y + footprintRight.y) / 2,
    });
    return Object.freeze({
      laneCenter: Object.freeze({ x: laneCenter.x, y: laneCenter.y }),
      laneLeft: Math.min(laneLeft.x, laneRight.x),
      laneRight: Math.max(laneLeft.x, laneRight.x),
      laneWidth: Math.abs(laneRight.x - laneLeft.x),
      footprintCenter,
      footprintLeft: Math.min(footprintLeft.x, footprintRight.x),
      footprintRight: Math.max(footprintLeft.x, footprintRight.x),
      footprintWidth: Math.abs(footprintRight.x - footprintLeft.x),
      adjacentLeftCenter: Math.min(adjacentLeftCenter.x, adjacentRightCenter.x),
      adjacentRightCenter: Math.max(adjacentLeftCenter.x, adjacentRightCenter.x),
    });
  }

  const VARIANT_KEYS = Object.freeze({
    drone: Object.freeze(['droneScout', 'droneStriker']),
    turret: Object.freeze(['turretSentry', 'turretHeavy']),
    wallLow: Object.freeze(['barrierRail', 'barrierCrate']),
    wallMedium: Object.freeze(['structurePylon', 'structureBastion']),
    wallHigh: Object.freeze(['structureReactor', 'structureTower']),
    corridorLow: Object.freeze(['corridorLow']),
    corridorMedium: Object.freeze(['corridorMedium']),
    gap: Object.freeze(['gapEdge']),
  });

  function variantKey(category, segmentIndex, stableLaneKey) {
    const keys = VARIANT_KEYS[category] || [];
    if (keys.length === 0) return null;
    const segment = Number.isInteger(segmentIndex) ? segmentIndex : 0;
    const lane = Number.isInteger(stableLaneKey) ? stableLaneKey : 0;
    return keys[Math.abs(segment * 31 + lane * 17 + category.length) % keys.length];
  }

  const api = Object.freeze({
    YAW_DEGREES,
    PITCH_DEGREES,
    WORLD_ATLAS_MANIFEST,
    WORLD_GEOMETRY,
    selectAxisBlend,
    selectViewBlend,
    selectYawBlend,
    atlasFrame,
    atlasFrameRect,
    validateAtlasMetadata,
    buildSpriteDrawPlan,
    roadEdgeFrame,
    worldSpriteDrawRect,
    projectedLaneEnvelope,
    variantKey,
  });

  root.Skyroads = root.Skyroads || {};
  root.Skyroads.worldArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(globalThis));
