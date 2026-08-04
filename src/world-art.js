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
      "drone-scout": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":226.8,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160,"y":226.472641},"source":{"sh":84,"sw":110,"sx":104,"sy":120}},{"origin":{"x":480,"y":226.472641},"source":{"sh":81,"sw":111,"sx":424,"sy":118}},{"origin":{"x":800,"y":226.472641},"source":{"sh":78,"sw":104,"sx":754,"sy":117}},{"origin":{"x":1120,"y":226.472641},"source":{"sh":80,"sw":98,"sx":1071,"sy":116}},{"origin":{"x":1440,"y":226.472641},"source":{"sh":78,"sw":104,"sx":1382,"sy":117}},{"origin":{"x":1760,"y":226.472641},"source":{"sh":81,"sw":112,"sx":1704,"sy":118}},{"origin":{"x":2080,"y":226.472641},"source":{"sh":84,"sw":110,"sx":2026,"sy":120}},{"origin":{"x":159.985992,"y":520.574074},"source":{"sh":88,"sw":110,"sx":104,"sy":446}},{"origin":{"x":479.985992,"y":520.574074},"source":{"sh":88,"sw":111,"sx":424,"sy":434}},{"origin":{"x":799.985992,"y":520.574074},"source":{"sh":103,"sw":104,"sx":754,"sy":428}},{"origin":{"x":1119.985992,"y":520.574074},"source":{"sh":101,"sw":98,"sx":1071,"sy":432}},{"origin":{"x":1439.985992,"y":520.574074},"source":{"sh":103,"sw":104,"sx":1382,"sy":428}},{"origin":{"x":1759.985992,"y":520.574074},"source":{"sh":88,"sw":112,"sx":1704,"sy":434}},{"origin":{"x":2079.985992,"y":520.574074},"source":{"sh":88,"sw":110,"sx":2026,"sy":446}},{"origin":{"x":159.995758,"y":812.283661},"source":{"sh":98,"sw":110,"sx":104,"sy":751}},{"origin":{"x":479.995758,"y":812.283661},"source":{"sh":102,"sw":111,"sx":424,"sy":747}},{"origin":{"x":799.995758,"y":812.283661},"source":{"sh":113,"sw":104,"sx":754,"sy":743}},{"origin":{"x":1119.995758,"y":812.283661},"source":{"sh":105,"sw":98,"sx":1071,"sy":748}},{"origin":{"x":1439.995758,"y":812.283661},"source":{"sh":113,"sw":104,"sx":1382,"sy":743}},{"origin":{"x":1759.995758,"y":812.283661},"source":{"sh":102,"sw":112,"sx":1704,"sy":747}},{"origin":{"x":2079.995758,"y":812.283661},"source":{"sh":98,"sw":110,"sx":2026,"sy":751}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.221058,"worldBounds":{"maxX":216,"maxY":500,"maxZ":25,"minX":-216,"minY":140,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "drone-striker": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":171.694557,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160,"y":226.472641},"source":{"sh":84,"sw":86,"sx":116,"sy":121}},{"origin":{"x":480,"y":226.472641},"source":{"sh":84,"sw":90,"sx":434,"sy":120}},{"origin":{"x":800,"y":226.472641},"source":{"sh":85,"sw":91,"sx":760,"sy":119}},{"origin":{"x":1120,"y":226.472641},"source":{"sh":85,"sw":98,"sx":1071,"sy":119}},{"origin":{"x":1440,"y":226.472641},"source":{"sh":85,"sw":91,"sx":1389,"sy":119}},{"origin":{"x":1760,"y":226.472641},"source":{"sh":84,"sw":90,"sx":1716,"sy":120}},{"origin":{"x":2080,"y":226.472641},"source":{"sh":84,"sw":86,"sx":2038,"sy":121}},{"origin":{"x":159.985992,"y":520.574074},"source":{"sh":85,"sw":86,"sx":116,"sy":448}},{"origin":{"x":479.985992,"y":520.574074},"source":{"sh":83,"sw":90,"sx":434,"sy":441}},{"origin":{"x":799.985992,"y":520.574074},"source":{"sh":80,"sw":91,"sx":760,"sy":439}},{"origin":{"x":1119.985992,"y":520.574074},"source":{"sh":79,"sw":98,"sx":1071,"sy":441}},{"origin":{"x":1439.985992,"y":520.574074},"source":{"sh":80,"sw":91,"sx":1389,"sy":439}},{"origin":{"x":1759.985992,"y":520.574074},"source":{"sh":83,"sw":90,"sx":1716,"sy":441}},{"origin":{"x":2079.985992,"y":520.574074},"source":{"sh":85,"sw":86,"sx":2038,"sy":448}},{"origin":{"x":159.995758,"y":812.283661},"source":{"sh":97,"sw":86,"sx":116,"sy":753}},{"origin":{"x":479.995758,"y":812.283661},"source":{"sh":88,"sw":90,"sx":434,"sy":754}},{"origin":{"x":799.995758,"y":812.283661},"source":{"sh":90,"sw":91,"sx":760,"sy":756}},{"origin":{"x":1119.995758,"y":812.283661},"source":{"sh":81,"sw":98,"sx":1071,"sy":760}},{"origin":{"x":1439.995758,"y":812.283661},"source":{"sh":90,"sw":91,"sx":1389,"sy":756}},{"origin":{"x":1759.995758,"y":812.283661},"source":{"sh":88,"sw":90,"sx":1716,"sy":754}},{"origin":{"x":2079.995758,"y":812.283661},"source":{"sh":97,"sw":86,"sx":2038,"sy":753}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.221058,"worldBounds":{"maxX":216,"maxY":500,"maxZ":25,"minX":-216,"minY":140,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "turret-sentry": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":244.8,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160,"y":216.763489},"source":{"sh":123,"sw":37,"sx":141,"sy":100}},{"origin":{"x":480,"y":216.763489},"source":{"sh":124,"sw":40,"sx":460,"sy":100}},{"origin":{"x":800,"y":216.763489},"source":{"sh":124,"sw":39,"sx":781,"sy":100}},{"origin":{"x":1120,"y":216.763489},"source":{"sh":123,"sw":32,"sx":1104,"sy":100}},{"origin":{"x":1440,"y":216.763489},"source":{"sh":124,"sw":39,"sx":1421,"sy":100}},{"origin":{"x":1760,"y":216.763489},"source":{"sh":124,"sw":40,"sx":1740,"sy":100}},{"origin":{"x":2080,"y":216.763489},"source":{"sh":123,"sw":37,"sx":2062,"sy":100}},{"origin":{"x":160,"y":514.647743},"source":{"sh":91,"sw":37,"sx":141,"sy":438}},{"origin":{"x":480,"y":514.647743},"source":{"sh":93,"sw":40,"sx":460,"sy":438}},{"origin":{"x":800,"y":514.647743},"source":{"sh":93,"sw":38,"sx":781,"sy":438}},{"origin":{"x":1120,"y":514.647743},"source":{"sh":90,"sw":32,"sx":1104,"sy":438}},{"origin":{"x":1440,"y":514.647743},"source":{"sh":93,"sw":38,"sx":1421,"sy":438}},{"origin":{"x":1760,"y":514.647743},"source":{"sh":93,"sw":39,"sx":1740,"sy":438}},{"origin":{"x":2080,"y":514.647743},"source":{"sh":91,"sw":37,"sx":2062,"sy":438}},{"origin":{"x":159.996368,"y":810.489487},"source":{"sh":47,"sw":37,"sx":141,"sy":781}},{"origin":{"x":479.996368,"y":810.489487},"source":{"sh":49,"sw":40,"sx":460,"sy":781}},{"origin":{"x":799.996368,"y":810.489487},"source":{"sh":48,"sw":38,"sx":781,"sy":781}},{"origin":{"x":1119.996368,"y":810.489487},"source":{"sh":46,"sw":32,"sx":1104,"sy":781}},{"origin":{"x":1439.996368,"y":810.489487},"source":{"sh":49,"sw":38,"sx":1421,"sy":781}},{"origin":{"x":1759.996368,"y":810.489487},"source":{"sh":49,"sw":40,"sx":1740,"sy":781}},{"origin":{"x":2079.996368,"y":810.489487},"source":{"sh":47,"sw":37,"sx":2062,"sy":781}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.063586,"worldBounds":{"maxX":244.8,"maxY":1900,"maxZ":25,"minX":-244.8,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "turret-heavy": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":244.8,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160,"y":216.763489},"source":{"sh":123,"sw":37,"sx":141,"sy":100}},{"origin":{"x":480,"y":216.763489},"source":{"sh":124,"sw":40,"sx":460,"sy":100}},{"origin":{"x":800,"y":216.763489},"source":{"sh":124,"sw":39,"sx":781,"sy":100}},{"origin":{"x":1120,"y":216.763489},"source":{"sh":122,"sw":32,"sx":1104,"sy":101}},{"origin":{"x":1440,"y":216.763489},"source":{"sh":124,"sw":39,"sx":1421,"sy":100}},{"origin":{"x":1760,"y":216.763489},"source":{"sh":124,"sw":40,"sx":1740,"sy":100}},{"origin":{"x":2080,"y":216.763489},"source":{"sh":122,"sw":37,"sx":2062,"sy":101}},{"origin":{"x":160,"y":514.647743},"source":{"sh":89,"sw":37,"sx":141,"sy":440}},{"origin":{"x":480,"y":514.647743},"source":{"sh":92,"sw":40,"sx":460,"sy":439}},{"origin":{"x":800,"y":514.647743},"source":{"sh":92,"sw":38,"sx":781,"sy":439}},{"origin":{"x":1120,"y":514.647743},"source":{"sh":88,"sw":32,"sx":1104,"sy":440}},{"origin":{"x":1440,"y":514.647743},"source":{"sh":92,"sw":38,"sx":1421,"sy":439}},{"origin":{"x":1760,"y":514.647743},"source":{"sh":92,"sw":39,"sx":1740,"sy":439}},{"origin":{"x":2080,"y":514.647743},"source":{"sh":89,"sw":37,"sx":2062,"sy":440}},{"origin":{"x":159.996368,"y":810.489487},"source":{"sh":45,"sw":37,"sx":141,"sy":783}},{"origin":{"x":479.996368,"y":810.489487},"source":{"sh":48,"sw":40,"sx":460,"sy":782}},{"origin":{"x":799.996368,"y":810.489487},"source":{"sh":47,"sw":38,"sx":781,"sy":782}},{"origin":{"x":1119.996368,"y":810.489487},"source":{"sh":44,"sw":32,"sx":1104,"sy":783}},{"origin":{"x":1439.996368,"y":810.489487},"source":{"sh":48,"sw":38,"sx":1421,"sy":782}},{"origin":{"x":1759.996368,"y":810.489487},"source":{"sh":48,"sw":40,"sx":1740,"sy":782}},{"origin":{"x":2079.996368,"y":810.489487},"source":{"sh":45,"sw":37,"sx":2062,"sy":783}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.063586,"worldBounds":{"maxX":244.8,"maxY":1900,"maxZ":25,"minX":-244.8,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "barrier-rail": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":164.492279,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.980591,"y":199.774635},"source":{"sh":111,"sw":64,"sx":128,"sy":105}},{"origin":{"x":479.980591,"y":199.774635},"source":{"sh":110,"sw":92,"sx":434,"sy":106}},{"origin":{"x":799.980591,"y":199.774635},"source":{"sh":106,"sw":104,"sx":748,"sy":108}},{"origin":{"x":1119.980591,"y":199.774635},"source":{"sh":96,"sw":94,"sx":1073,"sy":113}},{"origin":{"x":1439.980591,"y":199.774635},"source":{"sh":106,"sw":104,"sx":1388,"sy":108}},{"origin":{"x":1759.980591,"y":199.774635},"source":{"sh":110,"sw":92,"sx":1714,"sy":106}},{"origin":{"x":2079.980591,"y":199.774635},"source":{"sh":111,"sw":64,"sx":2048,"sy":105}},{"origin":{"x":159.991623,"y":504.277939},"source":{"sh":120,"sw":64,"sx":128,"sy":421}},{"origin":{"x":479.991623,"y":504.277939},"source":{"sh":121,"sw":92,"sx":434,"sy":422}},{"origin":{"x":799.991623,"y":504.277939},"source":{"sh":111,"sw":104,"sx":748,"sy":427}},{"origin":{"x":1119.991623,"y":504.277939},"source":{"sh":84,"sw":94,"sx":1073,"sy":440}},{"origin":{"x":1439.991623,"y":504.277939},"source":{"sh":111,"sw":104,"sx":1388,"sy":427}},{"origin":{"x":1759.991623,"y":504.277939},"source":{"sh":121,"sw":92,"sx":1714,"sy":422}},{"origin":{"x":2079.991623,"y":504.277939},"source":{"sh":120,"sw":64,"sx":2048,"sy":421}},{"origin":{"x":159.997467,"y":807.350021},"source":{"sh":105,"sw":64,"sx":128,"sy":749}},{"origin":{"x":479.997467,"y":807.350021},"source":{"sh":109,"sw":92,"sx":434,"sy":747}},{"origin":{"x":799.997467,"y":807.350021},"source":{"sh":94,"sw":104,"sx":748,"sy":754}},{"origin":{"x":1119.997467,"y":807.350021},"source":{"sh":60,"sw":94,"sx":1073,"sy":771}},{"origin":{"x":1439.997467,"y":807.350021},"source":{"sh":94,"sw":104,"sx":1388,"sy":754}},{"origin":{"x":1759.997467,"y":807.350021},"source":{"sh":109,"sw":92,"sx":1714,"sy":747}},{"origin":{"x":2079.997467,"y":807.350021},"source":{"sh":105,"sw":64,"sx":2048,"sy":749}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.141091,"worldBounds":{"maxX":324,"maxY":600,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "barrier-crate": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":30.019834,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.980591,"y":199.774635},"source":{"sh":110,"sw":26,"sx":147,"sy":106}},{"origin":{"x":479.980591,"y":199.774635},"source":{"sh":106,"sw":60,"sx":450,"sy":108}},{"origin":{"x":799.980591,"y":199.774635},"source":{"sh":97,"sw":84,"sx":758,"sy":112}},{"origin":{"x":1119.980591,"y":199.774635},"source":{"sh":84,"sw":94,"sx":1073,"sy":118}},{"origin":{"x":1439.980591,"y":199.774635},"source":{"sh":97,"sw":84,"sx":1398,"sy":112}},{"origin":{"x":1759.980591,"y":199.774635},"source":{"sh":106,"sw":60,"sx":1730,"sy":108}},{"origin":{"x":2079.980591,"y":199.774635},"source":{"sh":110,"sw":25,"sx":2067,"sy":106}},{"origin":{"x":159.991623,"y":504.277939},"source":{"sh":120,"sw":26,"sx":147,"sy":422}},{"origin":{"x":479.991623,"y":504.277939},"source":{"sh":111,"sw":60,"sx":450,"sy":426}},{"origin":{"x":799.991623,"y":504.277939},"source":{"sh":90,"sw":84,"sx":758,"sy":436}},{"origin":{"x":1119.991623,"y":504.277939},"source":{"sh":57,"sw":94,"sx":1073,"sy":452}},{"origin":{"x":1439.991623,"y":504.277939},"source":{"sh":90,"sw":84,"sx":1398,"sy":436}},{"origin":{"x":1759.991623,"y":504.277939},"source":{"sh":111,"sw":60,"sx":1730,"sy":426}},{"origin":{"x":2079.991623,"y":504.277939},"source":{"sh":120,"sw":25,"sx":2067,"sy":422}},{"origin":{"x":159.997467,"y":807.350021},"source":{"sh":103,"sw":26,"sx":147,"sy":750}},{"origin":{"x":479.997467,"y":807.350021},"source":{"sh":90,"sw":60,"sx":450,"sy":756}},{"origin":{"x":799.997467,"y":807.350021},"source":{"sh":65,"sw":84,"sx":758,"sy":768}},{"origin":{"x":1119.997467,"y":807.350021},"source":{"sh":24,"sw":94,"sx":1073,"sy":788}},{"origin":{"x":1439.997467,"y":807.350021},"source":{"sh":66,"sw":84,"sx":1398,"sy":768}},{"origin":{"x":1759.997467,"y":807.350021},"source":{"sh":91,"sw":60,"sx":1730,"sy":756}},{"origin":{"x":2079.997467,"y":807.350021},"source":{"sh":103,"sw":25,"sx":2067,"sy":750}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.141091,"worldBounds":{"maxX":324,"maxY":600,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-pylon": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":323.983811,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.974594,"y":212.024834},"source":{"sh":118,"sw":67,"sx":126,"sy":106}},{"origin":{"x":479.974594,"y":212.024834},"source":{"sh":119,"sw":76,"sx":442,"sy":106}},{"origin":{"x":799.974594,"y":212.024834},"source":{"sh":119,"sw":75,"sx":763,"sy":106}},{"origin":{"x":1119.974594,"y":212.024834},"source":{"sh":116,"sw":60,"sx":1090,"sy":107}},{"origin":{"x":1439.974594,"y":212.024834},"source":{"sh":119,"sw":75,"sx":1403,"sy":106}},{"origin":{"x":1759.974594,"y":212.024834},"source":{"sh":119,"sw":76,"sx":1722,"sy":106}},{"origin":{"x":2079.974594,"y":212.024834},"source":{"sh":118,"sw":67,"sx":2047,"sy":106}},{"origin":{"x":159.984497,"y":511.755295},"source":{"sh":94,"sw":67,"sx":126,"sy":445}},{"origin":{"x":479.984497,"y":511.755295},"source":{"sh":98,"sw":76,"sx":442,"sy":445}},{"origin":{"x":799.984497,"y":511.755295},"source":{"sh":97,"sw":75,"sx":763,"sy":445}},{"origin":{"x":1119.984497,"y":511.755295},"source":{"sh":90,"sw":60,"sx":1090,"sy":446}},{"origin":{"x":1439.984497,"y":511.755295},"source":{"sh":96,"sw":75,"sx":1403,"sy":446}},{"origin":{"x":1759.984497,"y":511.755295},"source":{"sh":98,"sw":76,"sx":1722,"sy":445}},{"origin":{"x":2079.984497,"y":511.755295},"source":{"sh":94,"sw":67,"sx":2047,"sy":445}},{"origin":{"x":159.9953,"y":809.613876},"source":{"sh":74,"sw":67,"sx":126,"sy":768}},{"origin":{"x":479.9953,"y":809.613876},"source":{"sh":84,"sw":76,"sx":442,"sy":763}},{"origin":{"x":799.9953,"y":809.613876},"source":{"sh":83,"sw":75,"sx":763,"sy":763}},{"origin":{"x":1119.9953,"y":809.613876},"source":{"sh":68,"sw":60,"sx":1090,"sy":771}},{"origin":{"x":1439.9953,"y":809.613876},"source":{"sh":83,"sw":75,"sx":1403,"sy":763}},{"origin":{"x":1759.9953,"y":809.613876},"source":{"sh":84,"sw":76,"sx":1722,"sy":763}},{"origin":{"x":2079.9953,"y":809.613876},"source":{"sh":75,"sw":67,"sx":2047,"sy":767}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.088582,"worldBounds":{"maxX":324,"maxY":1250,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-bastion": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":138.014557,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.974594,"y":212.024834},"source":{"sh":120,"sw":33,"sx":142,"sy":97}},{"origin":{"x":479.974594,"y":212.024834},"source":{"sh":118,"sw":44,"sx":458,"sy":98}},{"origin":{"x":799.974594,"y":212.024834},"source":{"sh":116,"sw":56,"sx":772,"sy":100}},{"origin":{"x":1119.974594,"y":212.024834},"source":{"sh":113,"sw":60,"sx":1090,"sy":104}},{"origin":{"x":1439.974594,"y":212.024834},"source":{"sh":116,"sw":56,"sx":1412,"sy":100}},{"origin":{"x":1759.974594,"y":212.024834},"source":{"sh":118,"sw":44,"sx":1738,"sy":98}},{"origin":{"x":2079.974594,"y":212.024834},"source":{"sh":120,"sw":33,"sx":2065,"sy":97}},{"origin":{"x":159.984497,"y":511.755295},"source":{"sh":98,"sw":33,"sx":142,"sy":424}},{"origin":{"x":479.984497,"y":511.755295},"source":{"sh":95,"sw":44,"sx":458,"sy":426}},{"origin":{"x":799.984497,"y":511.755295},"source":{"sh":90,"sw":56,"sx":772,"sy":431}},{"origin":{"x":1119.984497,"y":511.755295},"source":{"sh":84,"sw":60,"sx":1090,"sy":439}},{"origin":{"x":1439.984497,"y":511.755295},"source":{"sh":90,"sw":56,"sx":1412,"sy":431}},{"origin":{"x":1759.984497,"y":511.755295},"source":{"sh":95,"sw":44,"sx":1738,"sy":426}},{"origin":{"x":2079.984497,"y":511.755295},"source":{"sh":98,"sw":33,"sx":2065,"sy":424}},{"origin":{"x":159.9953,"y":809.613876},"source":{"sh":69,"sw":33,"sx":142,"sy":761}},{"origin":{"x":479.9953,"y":809.613876},"source":{"sh":63,"sw":44,"sx":458,"sy":764}},{"origin":{"x":799.9953,"y":809.613876},"source":{"sh":53,"sw":56,"sx":772,"sy":770}},{"origin":{"x":1119.9953,"y":809.613876},"source":{"sh":43,"sw":60,"sx":1090,"sy":780}},{"origin":{"x":1439.9953,"y":809.613876},"source":{"sh":53,"sw":56,"sx":1412,"sy":770}},{"origin":{"x":1759.9953,"y":809.613876},"source":{"sh":63,"sw":44,"sx":1738,"sy":764}},{"origin":{"x":2079.9953,"y":809.613876},"source":{"sh":69,"sw":33,"sx":2065,"sy":761}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.088582,"worldBounds":{"maxX":324,"maxY":1250,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-reactor": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":159.780824,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160,"y":215.766205},"source":{"sh":122,"sw":26,"sx":147,"sy":100}},{"origin":{"x":480,"y":215.766205},"source":{"sh":121,"sw":33,"sx":464,"sy":100}},{"origin":{"x":800,"y":215.766205},"source":{"sh":119,"sw":39,"sx":781,"sy":101}},{"origin":{"x":1120,"y":215.766205},"source":{"sh":116,"sw":40,"sx":1100,"sy":103}},{"origin":{"x":1440,"y":215.766205},"source":{"sh":119,"sw":39,"sx":1421,"sy":101}},{"origin":{"x":1760,"y":215.766205},"source":{"sh":121,"sw":34,"sx":1743,"sy":100}},{"origin":{"x":2080,"y":215.766205},"source":{"sh":122,"sw":27,"sx":2067,"sy":100}},{"origin":{"x":159.988251,"y":514.039001},"source":{"sh":92,"sw":27,"sx":146,"sy":436}},{"origin":{"x":479.988251,"y":514.039001},"source":{"sh":89,"sw":34,"sx":463,"sy":437}},{"origin":{"x":799.988251,"y":514.039001},"source":{"sh":83,"sw":39,"sx":780,"sy":440}},{"origin":{"x":1119.988251,"y":514.039001},"source":{"sh":76,"sw":40,"sx":1100,"sy":444}},{"origin":{"x":1439.988251,"y":514.039001},"source":{"sh":83,"sw":40,"sx":1420,"sy":440}},{"origin":{"x":1759.988251,"y":514.039001},"source":{"sh":89,"sw":33,"sx":1743,"sy":437}},{"origin":{"x":2079.988251,"y":514.039001},"source":{"sh":92,"sw":27,"sx":2067,"sy":436}},{"origin":{"x":159.994965,"y":810.305252},"source":{"sh":53,"sw":26,"sx":147,"sy":774}},{"origin":{"x":479.994965,"y":810.305252},"source":{"sh":48,"sw":34,"sx":463,"sy":776}},{"origin":{"x":799.994965,"y":810.305252},"source":{"sh":42,"sw":39,"sx":780,"sy":779}},{"origin":{"x":1119.994965,"y":810.305252},"source":{"sh":33,"sw":40,"sx":1100,"sy":784}},{"origin":{"x":1439.994965,"y":810.305252},"source":{"sh":42,"sw":40,"sx":1420,"sy":779}},{"origin":{"x":1759.994965,"y":810.305252},"source":{"sh":48,"sw":33,"sx":1743,"sy":776}},{"origin":{"x":2079.994965,"y":810.305252},"source":{"sh":53,"sw":26,"sx":2067,"sy":774}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.059345,"worldBounds":{"maxX":324,"maxY":2000,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "structure-tower": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":323.983814,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":160,"y":215.766205},"source":{"sh":128,"sw":45,"sx":137,"sy":96}},{"origin":{"x":480,"y":215.766205},"source":{"sh":129,"sw":52,"sx":454,"sy":96}},{"origin":{"x":800,"y":215.766205},"source":{"sh":129,"sw":50,"sx":775,"sy":96}},{"origin":{"x":1120,"y":215.766205},"source":{"sh":126,"sw":40,"sx":1100,"sy":97}},{"origin":{"x":1440,"y":215.766205},"source":{"sh":129,"sw":50,"sx":1415,"sy":96}},{"origin":{"x":1760,"y":215.766205},"source":{"sh":129,"sw":52,"sx":1734,"sy":96}},{"origin":{"x":2080,"y":215.766205},"source":{"sh":127,"sw":45,"sx":2058,"sy":97}},{"origin":{"x":159.988251,"y":514.039001},"source":{"sh":104,"sw":45,"sx":137,"sy":428}},{"origin":{"x":479.988251,"y":514.039001},"source":{"sh":110,"sw":52,"sx":454,"sy":425}},{"origin":{"x":799.988251,"y":514.039001},"source":{"sh":109,"sw":50,"sx":775,"sy":426}},{"origin":{"x":1119.988251,"y":514.039001},"source":{"sh":100,"sw":40,"sx":1100,"sy":430}},{"origin":{"x":1439.988251,"y":514.039001},"source":{"sh":109,"sw":50,"sx":1415,"sy":426}},{"origin":{"x":1759.988251,"y":514.039001},"source":{"sh":110,"sw":52,"sx":1734,"sy":425}},{"origin":{"x":2079.988251,"y":514.039001},"source":{"sh":104,"sw":45,"sx":2058,"sy":428}},{"origin":{"x":159.994965,"y":810.305252},"source":{"sh":64,"sw":45,"sx":137,"sy":768}},{"origin":{"x":479.994965,"y":810.305252},"source":{"sh":71,"sw":52,"sx":454,"sy":765}},{"origin":{"x":799.994965,"y":810.305252},"source":{"sh":70,"sw":50,"sx":775,"sy":765}},{"origin":{"x":1119.994965,"y":810.305252},"source":{"sh":60,"sw":40,"sx":1100,"sy":770}},{"origin":{"x":1439.994965,"y":810.305252},"source":{"sh":70,"sw":50,"sx":1415,"sy":765}},{"origin":{"x":1759.994965,"y":810.305252},"source":{"sh":71,"sw":52,"sx":1734,"sy":765}},{"origin":{"x":2079.994965,"y":810.305252},"source":{"sh":64,"sw":45,"sx":2058,"sy":768}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.059345,"worldBounds":{"maxX":324,"maxY":2000,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "corridor-low": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":164.492279,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.980591,"y":199.774635},"source":{"sh":111,"sw":64,"sx":128,"sy":105}},{"origin":{"x":479.980591,"y":199.774635},"source":{"sh":110,"sw":92,"sx":434,"sy":106}},{"origin":{"x":799.980591,"y":199.774635},"source":{"sh":106,"sw":104,"sx":748,"sy":108}},{"origin":{"x":1119.980591,"y":199.774635},"source":{"sh":96,"sw":94,"sx":1073,"sy":113}},{"origin":{"x":1439.980591,"y":199.774635},"source":{"sh":106,"sw":104,"sx":1388,"sy":108}},{"origin":{"x":1759.980591,"y":199.774635},"source":{"sh":110,"sw":92,"sx":1714,"sy":106}},{"origin":{"x":2079.980591,"y":199.774635},"source":{"sh":111,"sw":64,"sx":2048,"sy":105}},{"origin":{"x":159.991623,"y":504.277939},"source":{"sh":120,"sw":64,"sx":128,"sy":421}},{"origin":{"x":479.991623,"y":504.277939},"source":{"sh":121,"sw":92,"sx":434,"sy":422}},{"origin":{"x":799.991623,"y":504.277939},"source":{"sh":111,"sw":104,"sx":748,"sy":427}},{"origin":{"x":1119.991623,"y":504.277939},"source":{"sh":84,"sw":94,"sx":1073,"sy":440}},{"origin":{"x":1439.991623,"y":504.277939},"source":{"sh":111,"sw":104,"sx":1388,"sy":427}},{"origin":{"x":1759.991623,"y":504.277939},"source":{"sh":121,"sw":92,"sx":1714,"sy":422}},{"origin":{"x":2079.991623,"y":504.277939},"source":{"sh":120,"sw":64,"sx":2048,"sy":421}},{"origin":{"x":159.997467,"y":807.350021},"source":{"sh":105,"sw":64,"sx":128,"sy":749}},{"origin":{"x":479.997467,"y":807.350021},"source":{"sh":109,"sw":92,"sx":434,"sy":747}},{"origin":{"x":799.997467,"y":807.350021},"source":{"sh":94,"sw":104,"sx":748,"sy":754}},{"origin":{"x":1119.997467,"y":807.350021},"source":{"sh":60,"sw":94,"sx":1073,"sy":771}},{"origin":{"x":1439.997467,"y":807.350021},"source":{"sh":94,"sw":104,"sx":1388,"sy":754}},{"origin":{"x":1759.997467,"y":807.350021},"source":{"sh":109,"sw":92,"sx":1714,"sy":747}},{"origin":{"x":2079.997467,"y":807.350021},"source":{"sh":105,"sw":64,"sx":2048,"sy":749}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.141091,"worldBounds":{"maxX":324,"maxY":600,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]},
      "corridor-medium": {"atlasHeight":960,"atlasWidth":2240,"detailFrontZ":323.983817,"frameHeight":320,"frameWidth":320,"frames":[{"origin":{"x":159.974594,"y":212.024834},"source":{"sh":118,"sw":67,"sx":126,"sy":106}},{"origin":{"x":479.974594,"y":212.024834},"source":{"sh":119,"sw":76,"sx":442,"sy":106}},{"origin":{"x":799.974594,"y":212.024834},"source":{"sh":119,"sw":75,"sx":763,"sy":106}},{"origin":{"x":1119.974594,"y":212.024834},"source":{"sh":116,"sw":60,"sx":1090,"sy":107}},{"origin":{"x":1439.974594,"y":212.024834},"source":{"sh":119,"sw":75,"sx":1403,"sy":106}},{"origin":{"x":1759.974594,"y":212.024834},"source":{"sh":119,"sw":76,"sx":1722,"sy":106}},{"origin":{"x":2079.974594,"y":212.024834},"source":{"sh":118,"sw":67,"sx":2047,"sy":106}},{"origin":{"x":159.984497,"y":511.755295},"source":{"sh":94,"sw":67,"sx":126,"sy":445}},{"origin":{"x":479.984497,"y":511.755295},"source":{"sh":98,"sw":76,"sx":442,"sy":445}},{"origin":{"x":799.984497,"y":511.755295},"source":{"sh":97,"sw":75,"sx":763,"sy":445}},{"origin":{"x":1119.984497,"y":511.755295},"source":{"sh":90,"sw":60,"sx":1090,"sy":446}},{"origin":{"x":1439.984497,"y":511.755295},"source":{"sh":96,"sw":75,"sx":1403,"sy":446}},{"origin":{"x":1759.984497,"y":511.755295},"source":{"sh":98,"sw":76,"sx":1722,"sy":445}},{"origin":{"x":2079.984497,"y":511.755295},"source":{"sh":94,"sw":67,"sx":2047,"sy":445}},{"origin":{"x":159.9953,"y":809.613876},"source":{"sh":75,"sw":67,"sx":126,"sy":767}},{"origin":{"x":479.9953,"y":809.613876},"source":{"sh":85,"sw":76,"sx":442,"sy":762}},{"origin":{"x":799.9953,"y":809.613876},"source":{"sh":83,"sw":75,"sx":763,"sy":763}},{"origin":{"x":1119.9953,"y":809.613876},"source":{"sh":69,"sw":60,"sx":1090,"sy":770}},{"origin":{"x":1439.9953,"y":809.613876},"source":{"sh":83,"sw":75,"sx":1403,"sy":763}},{"origin":{"x":1759.9953,"y":809.613876},"source":{"sh":85,"sw":76,"sx":1722,"sy":762}},{"origin":{"x":2079.9953,"y":809.613876},"source":{"sh":75,"sw":67,"sx":2047,"sy":767}}],"layout":"upright","pitchDegrees":[20,55,80],"pixelsPerWorldUnit":0.088582,"worldBounds":{"maxX":324,"maxY":1250,"maxZ":25,"minX":-324,"minY":0,"minZ":-25},"yawDegrees":[-80,-55,-30,0,30,55,80]}
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
