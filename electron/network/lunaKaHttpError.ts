export function lunaKaHttpErrorMessage(status: number, body: string, fallback: string): string {
  let code = ''
  try {
    const payload = JSON.parse(body) as { error?: unknown }
    if (typeof payload.error === 'string' && /^[a-z0-9_-]{1,80}$/.test(payload.error)) code = payload.error
  } catch { code = '' }
  const messages: Record<string, string> = {
    'pairing-code-invalid': '配对码无效或已失效',
    'pairing-attempts-throttled': '尝试次数过多，请稍后再试',
    'authorization-denied': '手机端拒绝了此次授权请求',
    'authorization-request-throttled': '请求过于频繁，请稍后重试',
    'private-network-required': '只能连接同一局域网中的手机',
    'revision-conflict': '导演计划已在其他端修改，请刷新后重新应用本次修改',
    'invalid-plan-update': '计划字段不符合手机接口要求',
    'plan-create-rejected': '手机端拒绝创建该计划',
  }
  return `${messages[code] ?? fallback}：HTTP ${status}${code ? `（${code}）` : ''}`
}
