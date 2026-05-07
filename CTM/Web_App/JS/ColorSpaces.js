// ColorSpaces.js — OKLCH and HCT (Material) color space math.
// No external dependencies. Include before ClrGen.js.
//
// OKLCH: linear sRGB ↔ LMS ↔ Oklab ↔ OKLCH  (Björn Ottosson, public domain)
// HCT:   linear sRGB ↔ XYZ-D65 ↔ CAM16 + L* tone
//        (replicated from material-foundation/material-color-utilities, MIT license)

// ─── Shared gamma ─────────────────────────────────────────────────────────────

function _linearize(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function _delinearize(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function _hexToLinRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [
    _linearize(((n >> 16) & 255) / 255),
    _linearize(((n >> 8)  & 255) / 255),
    _linearize( (n        & 255) / 255),
  ];
}
function _linRgbToHex(r, g, b) {
  const cl = (v) => Math.max(0, Math.min(255, Math.round(_delinearize(Math.max(0, v)) * 255)));
  return "#" + [cl(r), cl(g), cl(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function _m3(m, v) {
  return [
    m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
    m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
    m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
  ];
}

// ─── OKLCH ────────────────────────────────────────────────────────────────────
// Reference: https://bottosson.github.io/posts/oklab/
// Pipeline: linear sRGB → LMS (M1) → cbrt → Oklab (M2) → OKLCH

// M1: linear sRGB → LMS
const _M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
// M2: LMS (cbrt) → Oklab
const _M2 = [
  [0.2104542553,  0.7936177850, -0.0040720468],
  [1.9779984951, -2.4285922050,  0.4505937099],
  [0.0259040371,  0.7827717662, -0.8086757660],
];
// M2_inv: Oklab → LMS (cbrt)
const _M2i = [
  [1.0000000000,  0.3963377774,  0.2158037573],
  [1.0000000000, -0.1055613458, -0.0638541728],
  [1.0000000000, -0.0894841775, -1.2914855480],
];
// M1_inv: LMS → linear sRGB
const _M1i = [
  [ 4.0767416621, -3.3077115913,  0.2309699292],
  [-1.2684380046,  2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147,  1.7076147010],
];

function hexToOklch(hex) {
  const [r, g, b] = _hexToLinRgb(hex);
  const lms = _m3(_M1, [r, g, b]).map((v) => Math.cbrt(Math.max(0, v)));
  const [L, a, b2] = _m3(_M2, lms);
  const C = Math.sqrt(a * a + b2 * b2);
  const H = ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

function oklchToHex(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const lmsCbrt = _m3(_M2i, [L, a, b]);
  const lms = lmsCbrt.map((v) => v * v * v);
  const [r, g, bl] = _m3(_M1i, lms);
  return _linRgbToHex(r, g, bl);
}

// ─── HCT (Material Color) ────────────────────────────────────────────────────
// Replicated from material-foundation/material-color-utilities (MIT license).
// HCT = Hue (CAM16) + Chroma (CAM16) + Tone (CIE L*)
//
// XYZ-D65 matrices for CAM16
const _LRGB_TO_XYZ = [
  [0.4123907993, 0.3575843394, 0.1804807884],
  [0.2126390059, 0.7151686788, 0.0721923154],
  [0.0193308187, 0.1191947798, 0.9505321522],
];
const _XYZ_TO_LRGB = [
  [ 3.2409699419, -1.5373831776, -0.4986107603],
  [-0.9692436363,  1.8759675015,  0.0415550574],
  [ 0.0556300797, -0.2039769589,  1.0569715142],
];

// CAM16 viewing conditions (sRGB standard, D65, 64 lux, 50% background)
const _CAM16_VC = (() => {
  const WHITE_XYZ = [95.047, 100.0, 108.883];
  // adaptingLuminance = (200/π) * Y(L*=50)/100  (material-color-utilities default)
  const adaptingLuminance = (200 / Math.PI) * Math.pow(66 / 116, 3);
  const F = 1.0, c = 0.69, Nc = 1.0;
  const k = 1 / (5 * adaptingLuminance + 1);
  const FL = 0.2 * k ** 4 * (5 * adaptingLuminance)
           + 0.1 * (1 - k ** 4) ** 2 * (5 * adaptingLuminance) ** (1 / 3);
  // n = Yb/Yw: Y at L*=50 background = ((66/116)^3) ≈ 0.18418
  const n  = Math.pow(66 / 116, 3);
  const z  = 1.48 + Math.sqrt(50 * n);
  const Nbb = 0.725 / Math.pow(n, 0.2);
  const Ncb = Nbb;

  // CAT02 chromatic adaptation
  const CAT02 = [
    [ 0.7328,  0.4296, -0.1624],
    [-0.7036,  1.6975,  0.0061],
    [ 0.0030,  0.0136,  0.9834],
  ];
  const CAT02_INV = [
    [ 1.0961238208,  -0.2788690002,   0.1827452039],
    [ 0.4543690419,   0.4735331543,   0.0720978039],
    [-0.0096276087,  -0.0056980312,   1.0153256399],
  ];
  // HPE matrix (Hunt-Pointer-Estevez, for adapted cone responses)
  const HPE = [
    [ 0.38971,  0.68898, -0.07868],
    [-0.22981,  1.18340,  0.04641],
    [ 0.00000,  0.00000,  1.00000],
  ];

  const D = F * (1 - (1 / 3.6) * Math.exp((-adaptingLuminance - 42) / 92));
  const rgbW = _m3(CAT02, WHITE_XYZ.map((v) => v / 100));
  const Drgb = rgbW.map((v) => D / v + 1 - D);

  const adapt = (c2) => {
    const f = (FL * Math.abs(c2)) ** 0.42;
    return 400 * Math.sign(c2) * f / (f + 27.13);
  };

  const HPE_INV = [
    [ 1.9101968341, -1.1121238928,  0.2019079568],
    [ 0.3709500882,  0.6290542574, -0.0000080551],
    [ 0.0000000000,  0.0000000000,  1.0000000000],
  ];

  const rgbAW = _m3(HPE, _m3(CAT02_INV, rgbW.map((v, i) => v * Drgb[i]))).map(adapt);
  const Aw = (2 * rgbAW[0] + rgbAW[1] + 0.05 * rgbAW[2] - 0.305) * Nbb;

  return { F, c, Nc, Nbb, Ncb, FL, n, z, Aw, D, Drgb, HPE, HPE_INV, CAT02, CAT02_INV, adapt };
})();

function _xyzD65ToHct(X, Y, Z) {
  const vc = _CAM16_VC;
  const rgb = _m3(vc.CAT02, [X, Y, Z]).map((v, i) => v * vc.Drgb[i]);
  const rgbA = _m3(vc.HPE, _m3(vc.CAT02_INV, rgb)).map(vc.adapt);
  const p2 = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2] - 0.305) * vc.Nbb;
  const a  = rgbA[0] - 12 * rgbA[1] / 11 + rgbA[2] / 11;
  const b2 = (rgbA[0] + rgbA[1] - 2 * rgbA[2]) / 9;
  const hDeg = ((Math.atan2(b2, a) * 180 / Math.PI) + 360) % 360;
  const t = (50000 / 13) * vc.Nc * vc.Ncb * Math.sqrt(a * a + b2 * b2) / (p2 + 0.305);
  const alpha = t === 0 ? 0 : Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73);
  const J = 100 * Math.pow(p2 / vc.Aw, vc.c * vc.z);
  const C = alpha * Math.sqrt(J / 100);
  // Tone = CIE L* from Y (relative to D65 white, Y in 0-1)
  const tone = Y <= 0 ? 0 : Y >= 1 ? 100 : 116 * Math.cbrt(Y) - 16;
  return { h: hDeg, c: C, t: tone };
}

function hexToHct(hex) {
  const [r, g, b] = _hexToLinRgb(hex);
  const [X, Y, Z] = _m3(_LRGB_TO_XYZ, [r, g, b]);
  return _xyzD65ToHct(X, Y, Z);
}

// Compute CAM16 J for an achromatic (gray) color with CIE L* = tone.
// This is the correct J to use in the inverse path for a given tone.
function _jFromTone(tone) {
  const vc = _CAM16_VC;
  if (tone <= 0) return 0;
  if (tone >= 100) return 100;
  // Y from L*
  const Y = tone > 8 ? Math.pow((tone + 16) / 116, 3) : tone / 903.3;
  // Forward CAM16 for achromatic [Y,Y,Y] in XYZ (D65)
  // For achromatic: X = Y * (Xw/Yw), Z = Y * (Zw/Yw) (approx; use D65 white)
  // D65 white: Xw=0.95047, Yw=1.0, Zw=1.08883
  const X = Y * 0.95047, Z = Y * 1.08883;
  const cat02 = _m3(vc.CAT02, [X, Y, Z]).map((v, i) => v * vc.Drgb[i]);
  const hpeRaw = _m3(vc.HPE, _m3(vc.CAT02_INV, cat02));
  const adpt = hpeRaw.map(vc.adapt);
  const p2 = (2 * adpt[0] + adpt[1] + 0.05 * adpt[2] - 0.305) * vc.Nbb;
  return 100 * Math.pow(Math.max(0, p2 / vc.Aw), vc.c * vc.z);
}

// Inverse: find linear sRGB for given (hue, chroma, J) via analytical CAM16 inversion.
function _hctToLinRgbOrNull(hue, chroma, J) {
  const vc = _CAM16_VC;
  if (J <= 0) return null;

  const t_alpha = chroma > 0
    ? Math.pow(chroma / Math.sqrt(J / 100), 1 / 0.9)
      / Math.pow(1.64 - Math.pow(0.29, vc.n), 0.73)
    : 0;

  const hr = (hue * Math.PI) / 180;
  const p1 = (50000 / 13) * vc.Nc * vc.Ncb;
  const p2 = Math.pow(J / 100, 1 / (vc.c * vc.z)) * vc.Aw / vc.Nbb + 0.305;

  let a, b2;
  if (t_alpha <= 0) {
    a = 0; b2 = 0;
  } else {
    const gamma = 23 * (p2 + 0.305) * t_alpha
      / (23 * p1 + 11 * t_alpha * Math.cos(hr) + 108 * t_alpha * Math.sin(hr));
    a  = gamma * Math.cos(hr);
    b2 = gamma * Math.sin(hr);
  }

  const Ra = (460 * p2 + 451 * a  + 288 * b2) / 1403;
  const Ga = (460 * p2 - 891 * a  - 261 * b2) / 1403;
  const Ba = (460 * p2 - 220 * a - 6300 * b2) / 1403;

  // Inverse adaptation: HPE-adapted → raw HPE cone response
  const invAdapt = (c2) => {
    const s = Math.sign(c2);
    const base = Math.abs(c2) * 27.13 / (400 - Math.abs(c2));
    return s * Math.pow(Math.max(0, base), 1 / 0.42) / vc.FL;
  };

  // Ra/Ga/Ba are HPE-adapted. Invert:
  //   1. inv-adapt → raw HPE cone responses
  //   2. HPE_INV → CAT02-adapted (D-scaled) responses
  //   3. /Drgb → un-discounted CAT02 responses
  //   4. CAT02_INV → XYZ → linRGB
  const rawHpe = [Ra, Ga, Ba].map(invAdapt);
  const cat02Rgb2 = _m3(vc.HPE_INV, rawHpe).map((v, i) => v / vc.Drgb[i]);
  const xyz = _m3(vc.CAT02_INV, cat02Rgb2);
  const [r, g, bl] = _m3(_XYZ_TO_LRGB, xyz);
  if (Math.max(r, g, bl) > 1 + 1e-4 || Math.min(r, g, bl) < -1e-4) return null;
  return [Math.max(0, r), Math.max(0, g), Math.max(0, bl)];
}

function hctToHex(hue, chroma, tone) {
  // Achromatic shortcut
  if (chroma < 0.0001 || tone <= 0 || tone >= 100) {
    if (tone <= 0) return "#000000";
    if (tone >= 100) return "#ffffff";
    const Y = tone > 8 ? Math.pow((tone + 16) / 116, 3) : tone / 903.3;
    const v = Math.round(_delinearize(Y) * 255);
    return "#" + v.toString(16).padStart(2, "0").repeat(3);
  }

  const J = _jFromTone(tone);
  if (J <= 0) return "#000000";

  // Binary search on chroma multiplier to find max in-gamut chroma at this J.
  // We search for the largest c <= chroma that stays in-gamut.
  let lo = 0, high = chroma, bestHex = null;
  for (let it = 0; it < 50; it++) {
    const mid = (lo + high) / 2;
    if (high - lo < 0.01) break;
    const rgb = _hctToLinRgbOrNull(hue, mid, J);
    if (rgb === null) {
      high = mid;
    } else {
      bestHex = _linRgbToHex(...rgb);
      lo = mid;
    }
  }
  return bestHex || ("#" + Math.round(_delinearize(
    tone > 8 ? Math.pow((tone + 16) / 116, 3) : tone / 903.3) * 255
  ).toString(16).padStart(2, "0").repeat(3));
}

// ─── Public API ──────────────────────────────────────────────────────────────
// hexToOklch(hex) → { L, C, H }
// oklchToHex(L, C, H) → hex string
// hexToHct(hex) → { h, c, t }
// hctToHex(hue, chroma, tone) → hex string
