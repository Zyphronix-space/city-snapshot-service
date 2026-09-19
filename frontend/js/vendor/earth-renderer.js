// CityScope — minimal custom WebGL renderer for a photo-textured Earth
// sphere. Swapped in for the earlier dot-matrix globe (cobe) so the globe
// reads as a real satellite-style Earth (matching Apple Weather's own
// globe, which is photoreal, not a stylised dot map) instead of an
// abstract point cloud.
//
// Deliberately hand-written rather than pulling in three.js: a UV sphere +
// one texture + one directional light is ~150 lines of standard WebGL, so
// a general-purpose 3D engine would add real weight for nothing this
// module needs. It exposes the same tiny `createGlobe(canvas, opts) ->
// {update, destroy}` shape the earlier cobe-based renderer did, using
// identical phi/theta/scale semantics, so the rest of js/globe.js (drag,
// zoom, marker projection, "fly to a city") needed no changes at all.
const TEXTURE_URL = new URL("./earth-day.jpg", import.meta.url).href;

const VERTEX_SRC = `
  attribute vec3 aPosition;
  attribute vec2 aUv;
  uniform float uPhi, uTheta, uScale, uAspect;
  varying vec2 vUv;
  varying vec3 vRotated;
  // 0.8 matches the sphere radius js/globe.js's own marker-projection math
  // (project()/markerScreenPos()) assumes — keep the two in lockstep, or
  // DOM markers will drift off the rendered globe.
  const float BASE_RADIUS = 0.8;
  void main() {
    float cosT = cos(uTheta), sinT = sin(uTheta);
    float cosP = cos(uPhi), sinP = sin(uPhi);
    float x = aPosition.x, y = aPosition.y, z = aPosition.z;
    float c = cosP * x + sinP * z;
    float s = sinP * sinT * x + cosT * y - cosP * sinT * z;
    float depth = -sinP * cosT * x + sinT * y + cosP * cosT * z;
    vUv = aUv;
    vRotated = vec3(c, s, depth);
    float r = uScale * BASE_RADIUS;
    gl_Position = vec4((c / uAspect) * r, -s * r, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision mediump float;
  varying vec2 vUv;
  varying vec3 vRotated;
  uniform sampler2D uTex;
  void main() {
    if (vRotated.z < 0.0) discard;
    vec3 n = normalize(vRotated);
    vec3 lightDir = normalize(vec3(0.35, 0.5, 0.85));
    float diffuse = max(dot(vec3(n.x, -n.y, n.z), lightDir), 0.0);
    float light = 0.44 + diffuse * 0.64;
    vec3 color = texture2D(uTex, vUv).rgb * light;
    float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 4.0);
    color += vec3(0.35, 0.55, 0.95) * rim * 0.55;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Same lat/lon -> unit-sphere mapping js/globe.js uses for markers, so a
// marker's projected position always lands exactly on the textured globe.
function toVector(lat, lon) {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180 - Math.PI;
  const cosLat = Math.cos(latRad);
  return [-cosLat * Math.cos(lonRad), Math.sin(latRad), cosLat * Math.sin(lonRad)];
}

function buildSphere(latSegs, lonSegs) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= latSegs; i++) {
    const lat = 90 - (i / latSegs) * 180;
    const v = i / latSegs;
    for (let j = 0; j <= lonSegs; j++) {
      const lon = (j / lonSegs) * 360 - 180;
      const u = j / lonSegs;
      positions.push(...toVector(lat, lon));
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < latSegs; i++) {
    for (let j = 0; j < lonSegs; j++) {
      const a = i * (lonSegs + 1) + j;
      const b = a + lonSegs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function createGlobe(canvas, opts) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, depth: false });
  if (!gl) return { update: () => {}, destroy: () => {} };

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return { update: () => {}, destroy: () => {} };
  }
  gl.useProgram(program);

  const mesh = buildSphere(48, 96);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  const uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, "aPosition");
  const aUv = gl.getAttribLocation(program, "aUv");
  const uPhi = gl.getUniformLocation(program, "uPhi");
  const uTheta = gl.getUniformLocation(program, "uTheta");
  const uScale = gl.getUniformLocation(program, "uScale");
  const uAspect = gl.getUniformLocation(program, "uAspect");
  const uTex = gl.getUniformLocation(program, "uTex");

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 1x1 placeholder (mid ocean-blue) shown until the real texture decodes,
  // so the first frame isn't a flash of black/transparent.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([12, 24, 46]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Left at the default (false): WebGL's texture origin is bottom-left,
    // so an unflipped upload already puts the source image's row 0 (north
    // pole) at v=0 — matching buildSphere()'s v=0-at-north convention.
    // Flipping it here put Tokyo's marker over Australia (right longitude,
    // wrong hemisphere) — confirmed by testing against a known coordinate.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
  };
  img.src = TEXTURE_URL;

  let width = opts.width || 300;
  let height = opts.height || 300;
  let phi = opts.phi || 0;
  let theta = opts.theta || 0;
  let scale = opts.scale || 1;
  const dpr = opts.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // The far hemisphere is already removed explicitly in the fragment
    // shader (`discard` on vRotated.z < 0); GPU face culling would be
    // redundant, and enabling it without also fixing up index winding for
    // GL's default CCW-front assumption cut every triangle — the sphere
    // rendered as fully transparent. Simplest correct fix: don't cull.

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.uniform1f(uPhi, phi);
    gl.uniform1f(uTheta, theta);
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uAspect, width / height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uTex, 0);

    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  function update(state) {
    if (state.phi !== undefined) phi = state.phi;
    if (state.theta !== undefined) theta = state.theta;
    if (state.scale !== undefined) scale = state.scale;
    if (state.width && state.height) {
      width = state.width;
      height = state.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    draw();
  }

  return {
    update,
    destroy() {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(uvBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    },
  };
}
