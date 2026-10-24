/* Optional composition helpers. No scene, geometry or style is mandatory. */
(() => {
  const ns = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    parent?.appendChild(el);
    return el;
  };
  const ease = p => { p = Math.max(0, Math.min(1, p)); return p * p * (3 - 2 * p); };
  const mix = (a, b, p) => a + (b - a) * p;
  function stage({ width = 640, height = 360 } = {}) {
    const svg = node('svg', { viewBox: `0 0 ${width} ${height}` });
    document.getElementById('scene').appendChild(svg);
    const world = node('g', {}, svg);
    return { svg, world };
  }
  function person(parent, { x = 320, y = 320, scale = 1, view = 'back', pose = 'stand', shirt = '#d4b89a', pants = '#343b49', skin = '#d5a780', hair = '#302b2b' } = {}) {
    const root = node('g', { transform: `translate(${x} ${y}) scale(${scale})` }, parent);
    node('ellipse', { cx: 0, cy: 0, rx: 22, ry: 5, fill: '#000', opacity: .18 }, root);
    const body = node('g', {}, root);
    const leg = d => node('path', { d, fill: 'none', stroke: pants, 'stroke-width': 12, 'stroke-linecap': 'round' }, body);
    const left = leg('M-8-47L-10-25L-12-5');
    const right = leg('M8-47L10-25L12-5');
    node('path', { d: 'M-15-88Q0-96 15-88L19-49Q0-42-19-49Z', fill: shirt }, body);
    const arm = d => node('path', { d, fill: 'none', stroke: shirt, 'stroke-width': 9, 'stroke-linecap': 'round' }, body);
    const a = arm('M-14-83L-22-63L-20-46');
    const b = arm('M14-83L22-63L20-46');
    node('path', { d: 'M-4-91V-99H4V-91', stroke: skin, 'stroke-width': 7 }, body);
    node('ellipse', { cx: 0, cy: -108, rx: view === 'side' ? 9 : 12, ry: 15, fill: skin }, body);
    node('path', { d: view === 'back' ? 'M-12-106Q-15-126 0-126Q15-126 12-104L7-98H-7Z' : 'M-12-110Q-15-126 0-126Q13-125 12-114Q0-121-12-110Z', fill: hair }, body);
    if (view === 'front') {
      node('path', { d: 'M-5-109h1m8 0h1', stroke: hair, 'stroke-width': 2 }, body);
    }
    if (view === 'side') node('path', { d: 'M8-114L14-107L8-105', fill: skin }, body);
    function render(p) {
      if (pose !== 'walk') return;
      const swing = Math.sin(p * Math.PI * 4) * 13;
      left.setAttribute('d', `M-8-47L${-10+swing*.4}-25L${-12+swing}-5`);
      right.setAttribute('d', `M8-47L${10-swing*.4}-25L${12-swing}-5`);
      a.setAttribute('transform', `rotate(${-swing} -14 -83)`);
      b.setAttribute('transform', `rotate(${swing} 14 -83)`);
      body.setAttribute('transform', `translate(0 ${-Math.abs(swing)*.12})`);
    }
    return { root, body, render };
  }
  function move(el, p, { from = [0, 0, 1], to = [0, 0, 1], start = 0, end = .85 } = {}) {
    const t = ease((p-start) / Math.max(.0001, end-start));
    el.setAttribute('transform', `translate(${mix(from[0],to[0],t)} ${mix(from[1],to[1],t)}) scale(${mix(from[2]??1,to[2]??1,t)})`);
  }
  function camera(el, p, { from = [320, 180, 1], to = [320, 180, 1.2], center = [320, 180], start = 0, end = .85 } = {}) {
    const t = ease((p-start)/Math.max(.0001,end-start));
    const x = mix(from[0],to[0],t), y = mix(from[1],to[1],t), z = mix(from[2],to[2],t);
    el.setAttribute('transform', `translate(${center[0]} ${center[1]}) scale(${z}) translate(${-x} ${-y})`);
  }
  window.LunaRef = Object.freeze({ version: 1, node, stage, person, move, camera, ease, mix });
})();
