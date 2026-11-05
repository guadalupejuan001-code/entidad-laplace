/* GENERADO desde el verificador C03 y comparador C04 originales. */
(() => {
  // node_modules/@noble/hashes/esm/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function abytes(b, ...lengths) {
    if (!isBytes(b))
      throw new Error("Uint8Array expected");
    if (lengths.length > 0 && !lengths.includes(b.length))
      throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error("digestInto() expects output buffer of length at least " + min);
    }
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  var hasHexBuiltin = /* @__PURE__ */ (() => (
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
  ))();
  var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  function bytesToHex(bytes) {
    abytes(bytes);
    if (hasHexBuiltin)
      return bytes.toHex();
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += hexes[bytes[i]];
    }
    return hex;
  }
  function utf8ToBytes(str) {
    if (typeof str !== "string")
      throw new Error("string expected");
    return new Uint8Array(new TextEncoder().encode(str));
  }
  function toBytes(data) {
    if (typeof data === "string")
      data = utf8ToBytes(data);
    abytes(data);
    return data;
  }
  var Hash = class {
  };
  function createHasher(hashCons) {
    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
    const tmp = hashCons();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashCons();
    return hashC;
  }

  // node_modules/@noble/hashes/esm/_md.js
  function setBigUint64(view, byteOffset, value, isLE) {
    if (typeof view.setBigUint64 === "function")
      return view.setBigUint64(byteOffset, value, isLE);
    const _32n = BigInt(32);
    const _u32_max = BigInt(4294967295);
    const wh = Number(value >> _32n & _u32_max);
    const wl = Number(value & _u32_max);
    const h = isLE ? 4 : 0;
    const l = isLE ? 0 : 4;
    view.setUint32(byteOffset + h, wh, isLE);
    view.setUint32(byteOffset + l, wl, isLE);
  }
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }
  var HashMD = class extends Hash {
    constructor(blockLen, outputLen, padOffset, isLE) {
      super();
      this.finished = false;
      this.length = 0;
      this.pos = 0;
      this.destroyed = false;
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      data = toBytes(data);
      abytes(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          continue;
        }
        buffer.set(data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
        }
      }
      this.length += data.length;
      this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      clean(this.buffer.subarray(pos));
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        pos = 0;
      }
      for (let i = pos; i < blockLen; i++)
        buffer[i] = 0;
      setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
      this.process(view, 0);
      const oview = createView(out);
      const len = this.outputLen;
      if (len % 4)
        throw new Error("_sha2: outputLen should be aligned to 32bit");
      const outLen = len / 4;
      const state = this.get();
      if (outLen > state.length)
        throw new Error("_sha2: outputLen bigger than state");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneInto(to) {
      to || (to = new this.constructor());
      to.set(...this.get());
      const { blockLen, buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (length % blockLen)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);

  // node_modules/@noble/hashes/esm/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  var SHA256 = class extends HashMD {
    constructor(outputLen = 32) {
      super(64, outputLen, 8, false);
      this.A = SHA256_IV[0] | 0;
      this.B = SHA256_IV[1] | 0;
      this.C = SHA256_IV[2] | 0;
      this.D = SHA256_IV[3] | 0;
      this.E = SHA256_IV[4] | 0;
      this.F = SHA256_IV[5] | 0;
      this.G = SHA256_IV[6] | 0;
      this.H = SHA256_IV[7] | 0;
    }
    get() {
      const { A, B, C, D, E, F, G, H } = this;
      return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G | 0;
      this.H = H | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G, H } = this;
      for (let i = 0; i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G;
        G = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G = G + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
      clean(SHA256_W);
    }
    destroy() {
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  };
  var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

  // node_modules/@noble/hashes/esm/sha256.js
  var sha2562 = sha256;

  // apps/laplace-android/mobile/crypto-shim.mjs
  function createHash(algorithm) {
    if (algorithm !== "sha256") throw Error("S\xF3lo SHA-256 forma parte del contrato m\xF3vil");
    const h = sha2562.create();
    return {
      update(value) {
        h.update(typeof value === "string" ? utf8ToBytes(value) : value);
        return this;
      },
      digest(encoding) {
        if (encoding !== "hex") throw Error("Formato de hash no admitido");
        return bytesToHex(h.digest());
      }
    };
  }

  // node_modules/lossless-json/lib/esm/utils.js
  function isInteger(value) {
    return INTEGER_REGEX.test(value);
  }
  var INTEGER_REGEX = /^-?[0-9]+$/;
  function isNumber(value) {
    return NUMBER_REGEX.test(value);
  }
  var NUMBER_REGEX = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
  function isSafeNumber(value, config2) {
    if (isInteger(value)) {
      return Number.isSafeInteger(Number.parseInt(value, 10));
    }
    const num = Number.parseFloat(value);
    if (Number.isInteger(num) && !Number.isSafeInteger(num)) {
      return false;
    }
    const parsed = String(num);
    if (value === parsed) {
      return true;
    }
    const valueDigits = extractSignificantDigits(value);
    const parsedDigits = extractSignificantDigits(parsed);
    if (valueDigits === parsedDigits) {
      return true;
    }
    if ((config2 == null ? void 0 : config2.approx) === true) {
      const requiredDigits = 14;
      if (parsedDigits.length >= requiredDigits && valueDigits.startsWith(parsedDigits.substring(0, requiredDigits))) {
        return true;
      }
    }
    return false;
  }
  var UnsafeNumberReason = /* @__PURE__ */ (function(UnsafeNumberReason2) {
    UnsafeNumberReason2["underflow"] = "underflow";
    UnsafeNumberReason2["overflow"] = "overflow";
    UnsafeNumberReason2["truncate_integer"] = "truncate_integer";
    UnsafeNumberReason2["truncate_float"] = "truncate_float";
    return UnsafeNumberReason2;
  })({});
  function getUnsafeNumberReason(value) {
    if (isSafeNumber(value, {
      approx: false
    })) {
      return void 0;
    }
    if (isInteger(value)) {
      return UnsafeNumberReason.truncate_integer;
    }
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) {
      return UnsafeNumberReason.overflow;
    }
    if (num === 0) {
      return UnsafeNumberReason.underflow;
    }
    return UnsafeNumberReason.truncate_float;
  }
  function extractSignificantDigits(value) {
    const {
      start,
      end
    } = getSignificantDigitRange(value);
    const digits = value.substring(start, end);
    const dot = digits.indexOf(".");
    if (dot === -1) {
      return digits;
    }
    return digits.substring(0, dot) + digits.substring(dot + 1);
  }
  function getSignificantDigitRange(value) {
    let start = 0;
    if (value[0] === "-") {
      start++;
    }
    while (value[start] === "0" || value[start] === ".") {
      start++;
    }
    let end = value.lastIndexOf("e");
    if (end === -1) {
      end = value.lastIndexOf("E");
    }
    if (end === -1) {
      end = value.length;
    }
    while ((value[end - 1] === "0" || value[end - 1] === ".") && end > start) {
      end--;
    }
    return {
      start,
      end
    };
  }

  // node_modules/lossless-json/lib/esm/LosslessNumber.js
  var losslessNumberMarker = Symbol.for("lossless-json.LosslessNumber");
  var LosslessNumber = class {
    // numeric value as string
    value;
    /**
     * @deprecated Use the isLosslessNumber(value) function instead.
     *
     * Ordinary objects may also have an isLosslessNumber property, so this
     * field cannot reliably identify lossless numbers.
     */
    isLosslessNumber = true;
    get [losslessNumberMarker]() {
      return true;
    }
    constructor(value) {
      if (!isNumber(value)) {
        throw new Error(`Invalid number (value: "${value}")`);
      }
      this.value = value;
    }
    /**
     * Get the value of the LosslessNumber as number or bigint.
     *
     * - a number is returned for safe numbers and decimal values that only lose some insignificant digits
     * - a bigint is returned for big integer numbers
     * - an Error is thrown for values that will overflow or underflow
     *
     * Note that you can implement your own strategy for conversion by just getting the value as string
     * via .toString(), and using util functions like isInteger, isSafeNumber, getUnsafeNumberReason,
     * and toSafeNumberOrThrow to convert it to a numeric value.
     */
    valueOf() {
      const unsafeReason = getUnsafeNumberReason(this.value);
      if (unsafeReason === void 0 || unsafeReason === UnsafeNumberReason.truncate_float) {
        return Number.parseFloat(this.value);
      }
      if (isInteger(this.value)) {
        return BigInt(this.value);
      }
      throw new Error(`Cannot safely convert to number: the value '${this.value}' would ${unsafeReason} and become ${Number.parseFloat(this.value)}`);
    }
    /**
     * Get the value of the LosslessNumber as string.
     */
    toString() {
      return this.value;
    }
    // Note: we do NOT implement a .toJSON() method, and you should not implement
    // or use that, it cannot safely turn the numeric value in the string into
    // stringified JSON since it has to be parsed into a number first.
  };

  // input/contrato.mjs
  var MAX_BODY = 2 * 1024 * 1024;

  // estado-financiero/modelo.mjs
  var FINANCIAL_FAMILIES = Object.freeze([
    "I001",
    "P001",
    "U001",
    "U002",
    "U003",
    "U004",
    "O001",
    "D001",
    "D002",
    "C001",
    "B001",
    "K001",
    "M001",
    "F001",
    "V001",
    "E001",
    "E002",
    "E003",
    "E004",
    "E005",
    "P002",
    "P003",
    "P004",
    "P005",
    "EF001",
    "X002",
    "externo"
  ]);

  // nucleo/registro-capacidades.mjs
  var CAPABILITY_CATALOG = Object.freeze([
    { id: "01", key: "XN01", title: "Direcci\xF3n BTC 5m XI/Ether", source: "apps/laplace-android/app/src/main/assets/xn01-native.xi" },
    { id: "02", key: "XN01_RAW", title: "M\xE1scara, prior, P(subida), soporte y registros XI", source: "apps/laplace-android/app/src/main/cpp/native_xn01_jni.cpp" },
    { id: "03", key: "EQUITIES", title: "Direcci\xF3n SPY/AAPL/NVDA", source: "integraciones/reverse-pc/reverse-os-android/app/src/main/java/com/reversepc/os/LaplaceActivity.java" },
    { id: "04", key: "X002", title: "Entrenamiento/calibraci\xF3n temporal", source: "experimentos/entrenamiento-x002.mjs" },
    { id: "05", key: "XG01", title: "Ablaci\xF3n local/global A/B con holdout", source: "experimentos/u002-predictive-xg01.mjs" },
    { id: "06", key: "CAUSAL", title: "Trayectoria observacional BTC/eventos", source: "bitcoin/causal.mjs" },
    { id: "07", key: "M001_DIARY", title: "Pron\xF3stico M001 y diario prospectivo", source: "seguimiento/diario.mjs" },
    { id: "08", key: "U002_XI", title: "Estados U002 y roundtrip XI", source: "integraciones/reverse-pc/reverse-os-android/app/src/main/assets/laplace/u002-native.xi" },
    { id: "09", key: "WORLD", title: "U003/U004 observaci\xF3n mundial", source: "universo/global-u003.mjs" },
    { id: "10", key: "ORDER_FLOW", title: "Libro de \xF3rdenes/operaciones", source: "integraciones/reverse-pc/reverse-os-android/app/src/main/assets/laplace/app.mjs" },
    { id: "11", key: "NOAA_EUR", title: "BTC/EUR, NOAA y contexto externo", source: "universo/global-u003.mjs" },
    { id: "12", key: "C001", title: "ETF SEC N-PORT: flujos aut\xE9nticos", source: "universo/fondos/global.mjs" },
    { id: "13", key: "O001", title: "FINRA corto, ATS y Non-ATS", source: "universo/otc/finra-query.mjs" },
    { id: "14", key: "D001_D002", title: "Derivados, funding, swaps OTC", source: "universo/derivados/global.mjs" },
    { id: "15", key: "B001", title: "Banca internacional BIS", source: "universo/banca/bis-sdmx.mjs" },
    { id: "16", key: "K001", title: "Blockchain y DeFi p\xFAblico", source: "universo/cripto/global-k001.mjs" },
    { id: "17", key: "EF001_EF005", title: "Archivo bitemporal persistente/escala", source: "estado-financiero/repositorio.mjs" },
    { id: "18", key: "EF003", title: "Leyes y escenarios de transici\xF3n", source: "estado-financiero/ejecucion.mjs" },
    { id: "19", key: "EF004", title: "Aprendizaje conjunto multivariante", source: "demonio/finanzas-ef004.mjs" },
    { id: "20", key: "RAW_V001", title: "F001 crudo, trazas, ablaci\xF3n y evidencia V001", source: "prediccion/fusion-temporal.mjs" }
  ].map((x) => Object.freeze(x)));

  // prediccion/fusion-temporal.mjs
  var HORIZON_PLAN = Object.freeze([
    [5, 300],
    [15, 300],
    [30, 300],
    [60, 300],
    [120, 300],
    [240, 3600],
    [480, 3600],
    [720, 3600],
    [1440, 3600],
    [4320, 3600],
    [10080, 86400],
    [20160, 86400],
    [43200, 86400],
    [129600, 86400]
  ].map(([minutes, granularity]) => Object.freeze({ minutes, granularity })));
  var HISTORIA_REQUERIDA = Object.freeze({
    300: { days: 14, chunkDays: 1 },
    3600: { days: 45, chunkDays: 10 },
    86400: { days: 1e3, chunkDays: 200 }
  });
  var AGE_MS = {
    mercado_global: 6 * 36e5,
    cripto_global: 6 * 36e5,
    clima_global: 6 * 36e5,
    sismologia_global: 48 * 36e5,
    geomagnetismo_global: 48 * 36e5,
    macro_global: 3 * 365 * 864e5
  };

  // universo/microestructura-medidas.mjs
  var CRYPTO_CONTEXT_ASSETS = Object.freeze(["BTC-USD", "ETH-USD", "SOL-USD"]);

  // prediccion/conjunta-f002.mjs
  var F002_GROUPS = Object.freeze([
    "mercados",
    "banca_tasas",
    "flujos_derivados",
    "economia_real",
    "eventos_ambiente",
    "otros"
  ]);
  var F002_FEATURE_NAMES = Object.freeze(F002_GROUPS.flatMap((x) => [x + "_shock", x + "_presencia"]).concat("btc_momento_anterior"));

  // prediccion/conjunta-c03.mjs
  var need2 = (ok, m) => {
    if (!ok) throw Error(m);
  };
  var finite = Number.isFinite;
  var hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
  function verificarPronosticoC03(f) {
    need2(
      (f == null ? void 0 : f.schema) === "laplace-c03-context-forecast-v1" && CRYPTO_CONTEXT_ASSETS.includes(f.asset),
      "C03: pron\xF3stico desconocido"
    );
    const { forecast_sha256, ...body } = f;
    need2(forecast_sha256 === hash(body), "C03: pron\xF3stico alterado");
    need2([f.reference_price, f.estimated_price, f.lower, f.upper].every((x) => finite(x) && x > 0) && f.lower <= f.upper && f.probability_up > 0 && f.probability_up < 1 && Date.parse(f.target_at) > Date.parse(f.issued_at), "C03: salida o cronolog\xEDa inv\xE1lida");
    return true;
  }

  // nucleo/comparacion-c04.mjs
  var need3 = (ok, m) => {
    if (!ok) throw Error(m);
  };
  function validarContextoC04(context, record) {
    const f = context == null ? void 0 : context.forecast;
    if (!f) return true;
    verificarPronosticoC03(f);
    need3(
      f.asset === record.asset && Date.parse(f.issued_at) / 1e3 <= record.issuedAt,
      "C04: contexto de otro activo o emitido despu\xE9s del registro"
    );
    return true;
  }
  function compararPronosticosC04(record, actualPrice, observedCloseAt) {
    var _a;
    const f = (_a = record.jointContext) == null ? void 0 : _a.forecast;
    if (!f) return { status: "context_forecast_not_issued" };
    validarContextoC04(record.jointContext, record);
    if (record.targetCloseAt === null || Date.parse(f.target_at) / 1e3 !== record.targetCloseAt || f.reference_price !== record.reference) return {
      status: "different_reference_or_target",
      native_target: record.targetCloseAt,
      context_target: Date.parse(f.target_at) / 1e3
    };
    need3(Number.isFinite(actualPrice) && actualPrice > 0 && observedCloseAt === record.targetCloseAt && observedCloseAt > record.issuedAt, "C04: resultado anterior a la emisi\xF3n o cierre incorrecto");
    const nativeError = Math.abs(record.outputs[0].predicted - actualPrice), contextError = Math.abs(f.estimated_price - actualPrice);
    const up = Number(actualPrice > record.reference);
    return {
      schema: "laplace-paired-c04-v1",
      status: "paired_evaluated",
      asset: record.asset,
      forecast_sha256: f.forecast_sha256,
      checkpoint_sha256: record.checkpointSHA256,
      reference_price: record.reference,
      target_close_at: record.targetCloseAt,
      actual_price: actualPrice,
      native_price_error: nativeError,
      context_price_error: contextError,
      paired_improvement: nativeError - contextError,
      native_brier: (record.probabilityUp - up) ** 2,
      context_brier: (f.probability_up - up) ** 2,
      automatic_trading: false
    };
  }

  // apps/laplace-android/mobile/c04-entry.mjs
  globalThis.LaplaceComparacionC04 = Object.freeze({ validarContextoC04, compararPronosticosC04 });
})();
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/

if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.LaplaceComparacionC04;
