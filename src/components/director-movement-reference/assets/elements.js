/* HTML-native components. Playback is driven exclusively by the shared player. */
(() => {
  const number = (el, key, fallback) => {
    const raw = el.getAttribute(key);
    const value = raw === null ? fallback : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  class ReferenceElement extends HTMLElement {
    connectedCallback() { this.update(); }
    attributeChangedCallback() { if (this.isConnected) this.update(); }
    render() {}
  }
  class Person extends ReferenceElement {
    static get observedAttributes() { return ['pose','facing','clothing','shirt','pants','skin','hair']; }
    update() {
      this.replaceChildren();
      const svg = LunaRef.node('svg', {viewBox:'-35 -132 70 140',preserveAspectRatio:'xMidYMax meet'});
      this.appendChild(svg);
      const clothing = this.getAttribute('clothing');
      const palette = clothing === 'dark' ? ['#39404c','#242936'] : clothing === 'light' ? ['#ece2cf','#8d938c'] : ['#d4b89a','#343b49'];
      const options = {x:0,y:0,view:this.getAttribute('facing') || 'back',pose:this.getAttribute('pose') || 'stand',shirt:palette[0],pants:palette[1]};
      for (const key of ['shirt','pants','skin','hair']) if(this.hasAttribute(key)) options[key]=this.getAttribute(key);
      this.figure = LunaRef.person(svg,options);
      this.render(this.progress || 0);
    }
    render(p) { this.progress=p; this.figure?.render(p); }
  }
  class Motion extends ReferenceElement {
    static get observedAttributes() { return ['from','to','start','end','easing']; }
    update() { this.render(this.progress || 0); }
    values(key) {
      const v=(this.getAttribute(key)||'0 0 1').trim().split(/[ ,]+/).map(Number);
      return [Number.isFinite(v[0])?v[0]:0,Number.isFinite(v[1])?v[1]:0,Number.isFinite(v[2])?v[2]:1];
    }
    render(p) {
      this.progress=p;
      const start=number(this,'start',0),end=number(this,'end',.85);
      let t=Math.max(0,Math.min(1,(p-start)/Math.max(.0001,end-start)));
      if(this.getAttribute('easing')!=='linear') t=LunaRef.ease(t);
      const a=this.values('from'),b=this.values('to');
      this.style.transform=`translate(${LunaRef.mix(a[0],b[0],t)}%,${LunaRef.mix(a[1],b[1],t)}%) scale(${LunaRef.mix(a[2],b[2],t)})`;
    }
  }
  class Camera extends Motion {
    static get observedAttributes() { return [...super.observedAttributes,'move','amount','origin']; }
    values(key) {
      if(this.hasAttribute(key)) return super.values(key);
      if(key==='from') return [0,0,1];
      const amount=number(this,'amount',.15);
      switch(this.getAttribute('move')||'push') {
        case 'pull': return [0,0,Math.max(.01,1-amount)];
        case 'pan-left': return [amount*100,0,1];
        case 'pan-right': return [-amount*100,0,1];
        case 'rise': return [0,amount*100,1];
        default: return [0,0,1+amount];
      }
    }
    update() { this.style.transformOrigin=this.getAttribute('origin')||'50% 50%'; super.update(); }
  }
  class Light extends ReferenceElement {
    static get observedAttributes() { return ['type','direction','intensity','color']; }
    update() {
      const type=this.getAttribute('type')||'sunset';
      const color=this.getAttribute('color')||(type==='window'?'#dcecfb':type==='backlight'?'#fff0d2':'#ffc48a');
      this.style.setProperty('--light-color',color);
      this.style.setProperty('--light-intensity',Math.max(0,Math.min(1,number(this,'intensity',.35))));
      this.style.setProperty('--light-position',this.getAttribute('direction')==='right'?'100% 30%':this.getAttribute('direction')==='top'?'50% 0%':'0% 30%');
    }
  }
  for(const [name,component] of [['person',Person],['motion',Motion],['camera',Camera],['light',Light]]) customElements.define(`luna-${name}`,component);
  window.LunaReferenceElements = {render(p) {
    document.querySelectorAll('#scene luna-person,#scene luna-motion,#scene luna-camera').forEach(el=>el.render(p));
  }};
})();
