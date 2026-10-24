import { useMemo, type CSSProperties } from 'react'
import type { DirectorMovementReference } from '../../shared/types/directorLab'
import shellHtml from './assets/shell.html?raw'
import playerScript from './assets/player.js?raw'
import componentScript from './assets/components.js?raw'
import elementScript from './assets/elements.js?raw'
import referenceCss from './assets/movement_reference.css?raw'
import './DirectorMovementReferencePreview.css'

interface Props {
  reference: DirectorMovementReference
  staticFrame?: boolean
  showHint?: boolean
  stage?: boolean
}

function inlineScript(source: string): string {
  return source.replace(/<\/script/gi, '<\\/script')
}

function inlineStyle(source: string): string {
  return source.replace(/<\/style/gi, '<\\/style')
}

function escapeAttribute(source: string): string {
  return source.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildSceneDocument(reference: DirectorMovementReference, staticFrame: boolean): string {
  const config = JSON.stringify({
    hint: reference.hint,
    durationMs: reference.duration_ms,
    playLabel: '播放构图演示',
    pauseLabel: '暂停构图演示',
    staticFrame,
  }).replace(/</g, '\\u003c')
  const replacements: Record<string, string> = {
    __SHELL_CSS__: `${referenceCss}\n#reference{width:100%;max-width:none;margin:0;}#hint{display:none;}#picture{aspect-ratio:${reference.aspect_ratio};}`,
    __SCENE_CSS__: inlineStyle(reference.scene_css),
    __SCENE_HTML__: reference.scene_html,
    __CONFIG_JSON__: config,
    __COMPONENT_SCRIPT__: inlineScript(componentScript),
    __ELEMENT_SCRIPT__: inlineScript(elementScript),
    __SCENE_SCRIPT__: inlineScript(reference.scene_script),
    __PLAYER_SCRIPT__: inlineScript(playerScript),
  }
  const scene = shellHtml.replace(/__[A-Z_]+__/g, token => replacements[token] ?? token)
  const safeScene = escapeAttribute(scene)
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src about:; form-action 'none'; base-uri 'none'"
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="构图演示内容" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${safeScene}"></iframe></body></html>`
}

export function DirectorMovementReferencePreview({ reference, staticFrame = false, showHint = false, stage = false }: Props) {
  const srcDoc = useMemo(() => buildSceneDocument(reference, staticFrame), [reference, staticFrame])
  const ratio = String(reference.aspect_ratio)
  return <div className={`director-movement-reference${stage ? ' is-stage' : ''}`}
    style={{ '--reference-ratio': ratio } as CSSProperties}>
    <div className="director-movement-reference-frame" style={{ aspectRatio: ratio } satisfies CSSProperties}>
      <iframe
        title="镜头构图演示"
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading={staticFrame ? 'lazy' : 'eager'}
        tabIndex={staticFrame ? -1 : 0}
      />
    </div>
    {showHint && <p className="director-movement-reference-hint">{reference.hint}</p>}
  </div>
}
